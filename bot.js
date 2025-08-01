const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Configurações de spam mais rigorosas
const messageCount = new Map();
const userWarnings = new Map();
const lastMessageContent = new Map(); // Para detectar mensagens repetidas

// CONFIGURAÇÕES ANTI-SPAM
const SPAM_CONFIG = {
    MAX_MESSAGES_5S: 2,        // Máximo 2 mensagens em 5 segundos
    MAX_MESSAGES_10S: 3,       // Máximo 3 mensagens em 10 segundos
    MAX_LINES: 10,             // Máximo 10 linhas por mensagem
    MAX_CHARS: 1500,           // Máximo 1500 caracteres
    MAX_MENTIONS: 3,           // Máximo 3 menções
    REPEATED_MSG_LIMIT: 2,     // Máximo 2 mensagens iguais seguidas
    TIME_WINDOW_5S: 5000,      // 5 segundos
    TIME_WINDOW_10S: 10000     // 10 segundos
};

client.once('ready', () => {
    console.log('=================================');
    console.log(`✅ BOT ANTI-SPAM MELHORADO: ${client.user.tag}`);
    console.log(`📊 SERVIDORES: ${client.guilds.cache.size}`);
    console.log('🛡️ PROTEÇÃO RIGOROSA ATIVA');
    console.log('=================================');
    console.log('📋 CONFIGURAÇÕES:');
    console.log(`   • Max 2 msgs em 5s | Max 3 msgs em 10s`);
    console.log(`   • Max ${SPAM_CONFIG.MAX_LINES} linhas por mensagem`);
    console.log(`   • Max ${SPAM_CONFIG.MAX_CHARS} caracteres`);
    console.log(`   • Max ${SPAM_CONFIG.MAX_MENTIONS} menções`);
    console.log('=================================');
});

// Função para aplicar punição progressiva
async function aplicarPunicao(member, message, motivo, tipoInfracao) {
    const userId = member.user.id;
    const warnings = userWarnings.get(userId) || 0;
    const newWarningCount = warnings + 1;
    userWarnings.set(userId, newWarningCount);
    
    let timeoutDuration;
    let punishmentType;
    
    switch(newWarningCount) {
        case 1:
            timeoutDuration = 5 * 60 * 1000; // 5 minutos
            punishmentType = "1ª infração - 5 minutos";
            break;
        case 2:
            timeoutDuration = 15 * 60 * 1000; // 15 minutos  
            punishmentType = "2ª infração - 15 minutos";
            break;
        case 3:
            timeoutDuration = 1 * 60 * 60 * 1000; // 1 hora
            punishmentType = "3ª infração - 1 hora";
            break;
        case 4:
            timeoutDuration = 6 * 60 * 60 * 1000; // 6 horas
            punishmentType = "4ª infração - 6 horas";
            break;
        default:
            timeoutDuration = 24 * 60 * 60 * 1000; // 1 dia
            punishmentType = "5+ infrações - 1 dia";
            break;
    }
    
    console.log(`🚨 ${tipoInfracao}: ${member.user.tag} - ${motivo}`);
    
    try {
        // Deleta a mensagem primeiro
        if (message && !message.deleted) {
            await message.delete();
        }
        
        // MÉTODO 1: Timeout (preferido)
        await member.timeout(timeoutDuration, `${tipoInfracao}: ${motivo} - ${punishmentType}`);
        
        const embed = new EmbedBuilder()
            .setTitle('🚨 USUÁRIO PUNIDO')
            .setDescription(`**${member.user.tag}** foi silenciado`)
            .addFields(
                { name: 'Motivo', value: `${tipoInfracao}: ${motivo}`, inline: false },
                { name: 'Punição', value: punishmentType, inline: true },
                { name: 'Infrações', value: `${newWarningCount}/5`, inline: true }
            )
            .setColor(0xff4444)
            .setTimestamp()
            .setThumbnail(member.user.displayAvatarURL());
            
        message.channel.send({ embeds: [embed] });
        console.log(`✅ ${member.user.tag} punido: ${punishmentType}`);
        
    } catch (timeoutError) {
        console.log(`❌ ERRO timeout: ${timeoutError.message}`);
        
        // MÉTODO 2: Role de mute como fallback
        try {
            let muteRole = message.guild.roles.cache.find(role => role.name === 'Muted');
            
            if (!muteRole) {
                console.log('🔧 Criando role de mute...');
                muteRole = await message.guild.roles.create({
                    name: 'Muted',
                    color: '#818386',
                    reason: 'Role de mute automática para anti-spam'
                });
                
                // Configura permissões em todos os canais
                for (const channel of message.guild.channels.cache.values()) {
                    if (channel.type === 0 || channel.type === 2) {
                        await channel.permissionOverwrites.create(muteRole, {
                            SendMessages: false,
                            Speak: false,
                            AddReactions: false
                        });
                    }
                }
                console.log('✅ Role de mute criada');
            }
            
            await member.roles.add(muteRole, `${tipoInfracao}: ${motivo} - ${punishmentType}`);
            message.channel.send(`⚠️ ${member.user.tag} foi **MUTADO** por **${punishmentType}** (${tipoInfracao})`);
            console.log(`✅ ${member.user.tag} mutado com role: ${punishmentType}`);
            
            // Remove role após o tempo
            setTimeout(async () => {
                try {
                    await member.roles.remove(muteRole, 'Tempo de mute expirado');
                    console.log(`✅ Mute removido de ${member.user.tag}`);
                    
                    const canal = message.guild.channels.cache.find(ch => 
                        ch.type === 0 && ch.permissionsFor(message.guild.members.me).has('SendMessages')
                    );
                    if (canal) {
                        canal.send(`🔓 ${member.user.tag} foi desmutado automaticamente`);
                    }
                } catch (removeError) {
                    console.log(`❌ Erro ao remover mute: ${removeError.message}`);
                }
            }, timeoutDuration);
            
        } catch (roleError) {
            console.log(`❌ ERRO role mute: ${roleError.message}`);
            
            // MÉTODO 3: Kick como último recurso (apenas para infrações graves)
            if (newWarningCount >= 4) {
                try {
                    await member.kick(`Múltiplas infrações: ${tipoInfracao} - ${punishmentType}`);
                    message.channel.send(`👢 ${member.user.tag} foi **EXPULSO** por **${punishmentType}** - falha no mute`);
                    console.log(`✅ ${member.user.tag} expulso como alternativa`);
                } catch (kickError) {
                    console.log(`❌ ERRO kick: ${kickError.message}`);
                    message.channel.send(`❌ **FALHA CRÍTICA:** Não consegui punir ${member.user.tag}!`);
                }
            } else {
                message.channel.send(`⚠️ **AVISO:** ${member.user.tag} deveria estar mutado - infração ${newWarningCount}/5 registrada`);
            }
        }
    }
}

client.on('messageCreate', async (message) => {
    // Ignora bots
    if (message.author.bot) return;
    
    const userId = message.author.id;
    const now = Date.now();
    const content = message.content;
    
    console.log(`💬 [${message.author.tag}]: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
    
    // === TESTE 1: MENSAGEM MUITO LONGA (10+ LINHAS) ===
    const lines = content.split('\n').length;
    if (lines > SPAM_CONFIG.MAX_LINES) {
        await aplicarPunicao(message.member, message, `${lines} linhas (máx ${SPAM_CONFIG.MAX_LINES})`, 'SPAM DE LINHAS');
        return;
    }
    
    // === TESTE 2: MENSAGEM MUITO GRANDE (CARACTERES) ===
    if (content.length > SPAM_CONFIG.MAX_CHARS) {
        await aplicarPunicao(message.member, message, `${content.length} caracteres (máx ${SPAM_CONFIG.MAX_CHARS})`, 'MENSAGEM MUITO GRANDE');
        return;
    }
    
    // === TESTE 3: SPAM DE FREQUÊNCIA (RIGOROSO) ===
    if (!messageCount.has(userId)) {
        messageCount.set(userId, []);
    }
    
    const userMessages = messageCount.get(userId);
    userMessages.push(now);
    
    // Remove mensagens antigas (mais de 10 segundos)
    messageCount.set(userId, userMessages.filter(time => now - time < SPAM_CONFIG.TIME_WINDOW_10S));
    
    const recentMessages10s = messageCount.get(userId).length;
    const recentMessages5s = messageCount.get(userId).filter(time => now - time < SPAM_CONFIG.TIME_WINDOW_5S).length;
    
    console.log(`📊 ${message.author.tag}: ${recentMessages5s} msgs/5s | ${recentMessages10s} msgs/10s`);
    
    // Verifica spam em 5 segundos (mais rigoroso)
    if (recentMessages5s > SPAM_CONFIG.MAX_MESSAGES_5S) {
        await aplicarPunicao(message.member, message, `${recentMessages5s} mensagens em 5s (máx ${SPAM_CONFIG.MAX_MESSAGES_5S})`, 'SPAM RÁPIDO');
        return;
    }
    
    // Verifica spam em 10 segundos
    if (recentMessages10s > SPAM_CONFIG.MAX_MESSAGES_10S) {
        await aplicarPunicao(message.member, message, `${recentMessages10s} mensagens em 10s (máx ${SPAM_CONFIG.MAX_MESSAGES_10S})`, 'SPAM DE MENSAGENS');
        return;
    }
    
    // === TESTE 4: MENSAGENS REPETIDAS ===
    const lastContent = lastMessageContent.get(userId) || '';
    if (content === lastContent && content.length > 10) {
        await aplicarPunicao(message.member, message, 'mensagem repetida', 'SPAM REPETITIVO');
        return;
    }
    lastMessageContent.set(userId, content);
    
    // === TESTE 5: SPAM DE MENÇÕES ===
    const mencoes = message.mentions.users.size + message.mentions.roles.size;
    if (mencoes > SPAM_CONFIG.MAX_MENTIONS) {
        await aplicarPunicao(message.member, message, `${mencoes} menções (máx ${SPAM_CONFIG.MAX_MENTIONS})`, 'SPAM DE MENÇÕES');
        return;
    }
    
    // === TESTE 6: PALAVRAS PROIBIDAS ===
    const palavrasProibidas = ['raid', 'spam', 'hack', 'token', 'ddos', 'nuke', 'crash'];
    const conteudoLower = content.toLowerCase();
    
    for (const palavra of palavrasProibidas) {
        if (conteudoLower.includes(palavra)) {
            await aplicarPunicao(message.member, message, `palavra proibida: "${palavra}"`, 'CONTEÚDO PROIBIDO');
            return;
        }
    }
    
    // === COMANDOS ADMIN ===
    if (message.content.startsWith('!')) {
        const comando = message.content.slice(1).toLowerCase();
        
        if (comando === 'test' && message.member.permissions.has('Administrator')) {
            const embed = new EmbedBuilder()
                .setTitle('🛡️ Bot Anti-Spam Ativo')
                .setDescription('Sistema funcionando com configurações rigorosas')
                .addFields(
                    { name: 'Limites por mensagem', value: `Max ${SPAM_CONFIG.MAX_LINES} linhas\nMax ${SPAM_CONFIG.MAX_CHARS} caracteres`, inline: true },
                    { name: 'Limites de frequência', value: `Max ${SPAM_CONFIG.MAX_MESSAGES_5S} msgs/5s\nMax ${SPAM_CONFIG.MAX_MESSAGES_10S} msgs/10s`, inline: true },
                    { name: 'Outras proteções', value: `Max ${SPAM_CONFIG.MAX_MENTIONS} menções\nDetecção de repetição\nPalavras proibidas`, inline: true }
                )
                .setColor(0x00ff00)
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        }
        
        if (comando === 'status' && message.member.permissions.has('ManageMessages')) {
            const embed = new EmbedBuilder()
                .setTitle('📊 Status Detalhado')
                .addFields(
                    { name: 'Usuários monitorados', value: messageCount.size.toString(), inline: true },
                    { name: 'Usuários com infrações', value: userWarnings.size.toString(), inline: true },
                    { name: 'Bot malicioso', value: 'ID: 1393030085606375435', inline: true }
                )
                .setColor(0x0099ff)
                .setTimestamp();
            
            message.reply({ embeds: [embed] });
        }
        
        if (comando === 'warnings' && message.member.permissions.has('ManageMessages')) {
            const userMention = message.mentions.users.first();
            if (userMention) {
                const warnings = userWarnings.get(userMention.id) || 0;
                const embed = new EmbedBuilder()
                    .setTitle('🔍 Infrações do Usuário')
                    .setDescription(`**${userMention.tag}** tem **${warnings}/5** infrações`)
                    .setColor(warnings >= 3 ? 0xff0000 : warnings >= 1 ? 0xff9900 : 0x00ff00)
                    .setThumbnail(userMention.displayAvatarURL());
                
                message.reply({ embeds: [embed] });
            } else {
                // Top 10 usuários com mais infrações
                const sortedWarnings = Array.from(userWarnings.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10);
                
                if (sortedWarnings.length === 0) {
                    message.reply('✅ Nenhum usuário com infrações!');
                } else {
                    let warningsList = '';
                    for (let i = 0; i < sortedWarnings.length; i++) {
                        const [userId, count] = sortedWarnings[i];
                        try {
                            const user = await client.users.fetch(userId);
                            warningsList += `${i + 1}. **${user.tag}**: ${count}/5 infrações\n`;
                        } catch {
                            warningsList += `${i + 1}. **ID ${userId}**: ${count}/5 infrações\n`;
                        }
                    }
                    
                    const embed = new EmbedBuilder()
                        .setTitle('📋 Top Usuários com Infrações')
                        .setDescription(warningsList)
                        .setColor(0xff9900);
                    
                    message.reply({ embeds: [embed] });
                }
            }
        }
        
        if (comando === 'clearwarnings' && message.member.permissions.has('Administrator')) {
            const userMention = message.mentions.users.first();
            if (userMention) {
                userWarnings.delete(userMention.id);
                message.reply(`✅ Infrações de **${userMention.tag}** resetadas!`);
            } else {
                userWarnings.clear();
                messageCount.clear();
                lastMessageContent.clear();
                message.reply('✅ Todos os dados de infrações foram resetados!');
            }
        }
        
        if (comando === 'botcheck' && message.member.permissions.has('ManageMessages')) {
            const botMention = message.mentions.users.first();
            if (botMention && botMention.bot) {
                try {
                    const member = await message.guild.members.fetch(botMention.id);
                    const analise = analisarBotSuspeito(member);
                    
                    const embed = new EmbedBuilder()
                        .setTitle('🤖 Análise de Bot')
                        .setDescription(`Análise do bot **${botMention.tag}**`)
                        .addFields(
                            { name: 'Score de Risco', value: `${analise.pontuacao}/100`, inline: true },
                            { name: 'Status', value: analise.critico ? '🔴 CRÍTICO' : analise.suspeito ? '🟡 SUSPEITO' : '🟢 SEGURO', inline: true },
                            { name: 'Idade da Conta', value: `${((Date.now() - botMention.createdTimestamp) / (1000 * 60 * 60 * 24)).toFixed(1)} dias`, inline: true }
                        )
                        .setColor(analise.critico ? 0xff0000 : analise.suspeito ? 0xff9900 : 0x00ff00)
                        .setThumbnail(botMention.displayAvatarURL());
                    
                    if (analise.motivos.length > 0) {
                        embed.addFields({ name: 'Motivos de Suspeita', value: analise.motivos.map(m => `• ${m}`).join('\n'), inline: false });
                    }
                    
                    message.reply({ embeds: [embed] });
                } catch (error) {
                    message.reply('❌ Erro ao analisar o bot mencionado');
                }
            } else {
                message.reply('❌ Mencione um bot válido para análise');
            }
        }
        
        if (comando === 'whitelist' && message.member.permissions.has('Administrator')) {
            const args = message.content.split(' ');
            if (args.length < 3) {
                message.reply('❌ Use: `!whitelist add/remove <ID_do_bot>`');
                return;
            }
            
            const acao = args[1].toLowerCase();
            const botId = args[2];
            
            if (acao === 'add') {
                if (!BOTS_MALICIOSOS.includes(botId)) {
                    // Adicionar à whitelist (remover da blacklist se estiver)
                    const index = BOTS_MALICIOSOS.indexOf(botId);
                    if (index > -1) {
                        BOTS_MALICIOSOS.splice(index, 1);
                    }
                    message.reply(`✅ Bot ${botId} removido da lista negra (whitelistado)`);
                } else {
                    message.reply(`⚠️ Bot ${botId} não está na lista negra`);
                }
            } else if (acao === 'remove') {
                if (!BOTS_MALICIOSOS.includes(botId)) {
                    BOTS_MALICIOSOS.push(botId);
                    message.reply(`✅ Bot ${botId} adicionado à lista negra`);
                } else {
                    message.reply(`⚠️ Bot ${botId} já está na lista negra`);
                }
            } else {
                message.reply('❌ Use `add` ou `remove`');
            }
        }
        
        if (comando === 'blacklist' && message.member.permissions.has('Administrator')) {
            if (BOTS_MALICIOSOS.length === 0) {
                message.reply('✅ Lista negra está vazia');
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('📋 Lista Negra de Bots')
                    .setDescription(`Bots que serão banidos automaticamente:\n\n${BOTS_MALICIOSOS.map((id, index) => `${index + 1}. \`${id}\``).join('\n')}`)
                    .setColor(0xff0000)
                    .setTimestamp();
                
                message.reply({ embeds: [embed] });
            }
        }
    }
});

// === PROTEÇÃO AVANÇADA CONTRA BOTS SUSPEITOS ===
const BOTS_MALICIOSOS = [
    '1393030085606375435', // Bot conhecido malicioso
    // Adicione mais IDs conforme necessário
];

// Configurações de detecção de bots suspeitos
const BOT_DETECTION = {
    MAX_BOT_AGE_DAYS: 7,           // Bots com menos de 7 dias são suspeitos
    SUSPICIOUS_KEYWORDS: [         // Palavras suspeitas no nome/bio
        'raid', 'spam', 'nuke', 'crash', 'ddos', 'hack', 'token', 
        'selfbot', 'mass', 'destroy', 'delete', 'ban', 'kick',
        'admin', 'owner', 'mod', 'staff', 'official', 'discord'
    ],
    SUSPICIOUS_PATTERNS: [         // Padrões suspeitos no nome
        /^[a-z]{1,3}[0-9]{3,}$/,   // Ex: abc123, xy4567
        /^[A-Z]{2,}[0-9]+$/,       // Ex: BOT123, RAID456
        /discord.*(bot|official)/i, // Fingindo ser oficial
        /^.{1,2}$/,                // Nomes muito curtos
        /[^\w\s]/                  // Caracteres especiais suspeitos
    ],
    BAN_SUSPICIOUS_BOTS: true,     // Se deve banir bots suspeitos automaticamente
    BAN_INVITER: true,             // Se deve banir quem convidou
    WHITELIST_ROLES: ['Administrator', 'Owner', 'Moderator'] // Roles que não são banidas
};

// Função para analisar se um bot é suspeito
function analisarBotSuspeito(member) {
    if (!member.user.bot) return { suspeito: false, motivos: [] };
    
    const motivos = [];
    let pontuacaoSuspeita = 0;
    
    // 1. Verificar lista negra
    if (BOTS_MALICIOSOS.includes(member.user.id)) {
        motivos.push('Bot na lista negra');
        pontuacaoSuspeita += 100; // Ban imediato
    }
    
    // 2. Verificar idade da conta
    const accountAge = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
    if (accountAge < BOT_DETECTION.MAX_BOT_AGE_DAYS) {
        motivos.push(`Conta muito nova (${accountAge.toFixed(1)} dias)`);
        pontuacaoSuspeita += 30;
    }
    
    // 3. Verificar nome suspeito
    const username = member.user.username.toLowerCase();
    const displayName = member.user.displayName?.toLowerCase() || '';
    
    for (const keyword of BOT_DETECTION.SUSPICIOUS_KEYWORDS) {
        if (username.includes(keyword) || displayName.includes(keyword)) {
            motivos.push(`Nome contém palavra suspeita: "${keyword}"`);
            pontuacaoSuspeita += 25;
        }
    }
    
    // 4. Verificar padrões suspeitos no nome
    for (const pattern of BOT_DETECTION.SUSPICIOUS_PATTERNS) {
        if (pattern.test(username) || pattern.test(displayName)) {
            motivos.push('Padrão de nome suspeito');
            pontuacaoSuspeita += 20;
            break;
        }
    }
    
    // 5. Verificar avatar padrão (mais suspeito)
    if (!member.user.avatar) {
        motivos.push('Sem avatar personalizado');
        pontuacaoSuspeita += 15;
    }
    
    // 6. Verificar se o nome é muito genérico
    if (/^(bot|user|member)[0-9]*$/i.test(username)) {
        motivos.push('Nome muito genérico');
        pontuacaoSuspeita += 20;
    }
    
    return {
        suspeito: pontuacaoSuspeita >= 50, // 50+ pontos = suspeito
        critico: pontuacaoSuspeita >= 80,  // 80+ pontos = ban imediato
        pontuacao: pontuacaoSuspeita,
        motivos: motivos
    };
}

// Função para banir bot suspeito e quem convidou
async function banirBotSuspeito(member, analise, quemConvidou = null) {
    const guild = member.guild;
    const motivo = `Bot suspeito detectado: ${analise.motivos.join(', ')} (Score: ${analise.pontuacao})`;
    
    try {
        // 1. BANIR O BOT
        await member.ban({ 
            reason: motivo,
            deleteMessageDays: 1 
        });
        
        console.log(`✅ BOT SUSPEITO BANIDO: ${member.user.tag} (Score: ${analise.pontuacao})`);
        
        // 2. TENTAR BANIR QUEM CONVIDOU (se habilitado)
        let quemConvidouBanido = false;
        if (BOT_DETECTION.BAN_INVITER && quemConvidou) {
            try {
                // Buscar o membro que convidou
                const membroConvidador = await guild.members.fetch(quemConvidou.id).catch(() => null);
                
                if (membroConvidador) {
                    // Verificar se não é o dono do servidor
                    if (membroConvidador.id === guild.ownerId) {
                        console.log(`⚠️ Não banindo ${quemConvidou.tag} - é o dono do servidor`);
                    }
                    // Verificar se não tem roles protegidas
                    else if (membroConvidador.roles.cache.some(role => 
                        BOT_DETECTION.WHITELIST_ROLES.some(wRole => 
                            role.name.toLowerCase().includes(wRole.toLowerCase())
                        )
                    )) {
                        console.log(`⚠️ Não banindo ${quemConvidou.tag} - tem role protegida`);
                    }
                    // Verificar se não é administrador
                    else if (membroConvidador.permissions.has('Administrator')) {
                        console.log(`⚠️ Não banindo ${quemConvidou.tag} - é administrador`);
                    }
                    else {
                        // BANIR QUEM CONVIDOU
                        await membroConvidador.ban({
                            reason: `Convidou bot suspeito: ${member.user.tag} - ${motivo}`,
                            deleteMessageDays: 1
                        });
                        
                        quemConvidouBanido = true;
                        console.log(`✅ CONVIDADOR BANIDO: ${quemConvidou.tag}`);
                    }
                }
            } catch (banConvidadorError) {
                console.log(`❌ Erro ao banir convidador: ${banConvidadorError.message}`);
            }
        }
        
        // 3. ALERTA NO CANAL
        const canal = guild.channels.cache.find(ch => 
            ch.type === 0 && ch.permissionsFor(guild.members.me).has('SendMessages')
        );
        
        if (canal) {
            const embed = new EmbedBuilder()
                .setTitle('🚨 BOT SUSPEITO BANIDO AUTOMATICAMENTE')
                .setDescription(`Bot **${member.user.tag}** foi banido pelo sistema de proteção`)
                .addFields(
                    { name: 'ID do Bot', value: member.user.id, inline: true },
                    { name: 'Score de Risco', value: `${analise.pontuacao}/100`, inline: true },
                    { name: 'Classificação', value: analise.critico ? '🔴 CRÍTICO' : '🟡 SUSPEITO', inline: true },
                    { name: 'Motivos Detectados', value: analise.motivos.map(m => `• ${m}`).join('\n'), inline: false }
                )
                .setColor(analise.critico ? 0xff0000 : 0xff9900)
                .setTimestamp()
                .setThumbnail(member.user.displayAvatarURL());
            
            if (quemConvidou) {
                embed.addFields({ 
                    name: 'Convidado por', 
                    value: `${quemConvidou.tag} ${quemConvidouBanido ? '🔴 (BANIDO)' : '🟡 (Protegido)'}`, 
                    inline: false 
                });
            }
            
            await canal.send({ embeds: [embed] });
        }
        
        return true;
        
    } catch (error) {
        console.log(`❌ ERRO ao banir bot suspeito: ${error.message}`);
        
        // Tentar kick como alternativa
        try {
            await member.kick('Bot suspeito - sem permissão para ban');
            console.log(`✅ BOT SUSPEITO EXPULSO: ${member.user.tag}`);
            return true;
        } catch (kickError) {
            console.log(`❌ ERRO ao expulsar bot: ${kickError.message}`);
            return false;
        }
    }
}

client.on('guildMemberAdd', async (member) => {
    console.log(`👤 NOVO MEMBRO: ${member.user.tag} (${member.user.id}) ${member.user.bot ? '🤖' : '👨'}`);
    
    // === ANÁLISE DE BOTS ===
    if (member.user.bot) {
        console.log(`🤖 ANALISANDO BOT: ${member.user.tag}`);
        
        // Buscar quem adicionou o bot
        let quemConvidou = null;
        try {
            const auditLogs = await member.guild.fetchAuditLogs({
                type: 28, // BOT_ADD
                limit: 10
            });
            
            const logEntry = auditLogs.entries.find(entry => 
                entry.target.id === member.user.id && 
                Date.now() - entry.createdTimestamp < 30000 // Últimos 30 segundos
            );
            
            if (logEntry) {
                quemConvidou = logEntry.executor;
                console.log(`🔍 BOT CONVIDADO POR: ${quemConvidou.tag}`);
            }
        } catch (error) {
            console.log(`❌ Erro ao buscar audit logs: ${error.message}`);
        }
        
        // Analisar se o bot é suspeito
        const analise = analisarBotSuspeito(member);
        
        console.log(`📊 ANÁLISE DO BOT:`);
        console.log(`   • Score: ${analise.pontuacao}/100`);
        console.log(`   • Suspeito: ${analise.suspeito ? 'SIM' : 'NÃO'}`);
        console.log(`   • Crítico: ${analise.critico ? 'SIM' : 'NÃO'}`);
        console.log(`   • Motivos: ${analise.motivos.join(', ') || 'Nenhum'}`);
        
        if (analise.suspeito && BOT_DETECTION.BAN_SUSPICIOUS_BOTS) {
            await banirBotSuspeito(member, analise, quemConvidou);
            return;
        } else if (analise.pontuacao > 20) {
            // Bot com pontuação baixa mas ainda suspeito - apenas alertar
            const canal = member.guild.channels.cache.find(ch => 
                ch.type === 0 && ch.permissionsFor(member.guild.members.me).has('SendMessages')
            );
            
            if (canal) {
                const embed = new EmbedBuilder()
                    .setTitle('⚠️ Bot com Características Suspeitas')
                    .setDescription(`Bot **${member.user.tag}** foi adicionado mas tem algumas características suspeitas`)
                    .addFields(
                        { name: 'Score de Risco', value: `${analise.pontuacao}/100`, inline: true },
                        { name: 'Status', value: '🟡 Monitoramento', inline: true },
                        { name: 'Motivos', value: analise.motivos.map(m => `• ${m}`).join('\n') || 'Nenhum motivo específico', inline: false }
                    )
                    .setColor(0xffaa00)
                    .setTimestamp()
                    .setThumbnail(member.user.displayAvatarURL());
                
                if (quemConvidou) {
                    embed.addFields({ name: 'Convidado por', value: quemConvidou.tag, inline: true });
                }
                
                canal.send({ embeds: [embed] });
            }
        }
    }
    
    // === ANÁLISE DE USUÁRIOS SUSPEITOS ===
    else {
        const accountAge = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
        console.log(`📅 USUÁRIO: Conta tem ${accountAge.toFixed(1)} dias`);
        
        if (accountAge < 1) {
            console.log(`⚠️ CONTA MUITO NOVA: ${member.user.tag}`);
            
            const canal = member.guild.channels.cache.find(ch => 
                ch.type === 0 && ch.permissionsFor(member.guild.members.me).has('SendMessages')
            );
            
            if (canal) {
                const embed = new EmbedBuilder()
                    .setTitle('⚠️ Conta Muito Nova')
                    .setDescription(`${member.user.tag} tem uma conta muito nova`)
                    .addFields(
                        { name: 'Idade da conta', value: `${accountAge.toFixed(1)} dias`, inline: true },
                        { name: 'Status', value: 'Monitoramento ativo', inline: true }
                    )
                    .setColor(0xff9900)
                    .setTimestamp()
                    .setThumbnail(member.user.displayAvatarURL());
                
                canal.send({ embeds: [embed] });
            }
        }
    }
});

console.log('🛡️ Sistema anti-spam rigoroso inicializado');
console.log('🎯 Proteção ativa contra bot IDs: ' + BOTS_MALICIOSOS.join(', '));

// LOGIN DO BOT - COLOQUE SEU TOKEN AQUI
client.login('MTQwMDY1OTUxMDc3NDk4ODkxMA.Gma1Ql.ujcVU9JPfIG3aIXr1Hq6teOtrtVAjjp5PvxIjo');