require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    Partials,
    Events,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    SlashCommandBuilder,
    REST,
    Routes,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

const express = require('express');
const crypto  = require('crypto');

/* ───────────────────────────── */
/* OAuth Config                 */
/* ───────────────────────────── */

const REDIRECT_URI      = `https://${process.env.REPLIT_DEV_DOMAIN}/callback`;
const ROBLOX_AUTH_URL   = 'https://apis.roblox.com/oauth/v1/authorize';
const ROBLOX_TOKEN_URL  = 'https://apis.roblox.com/oauth/v1/token';
const ROBLOX_USER_URL   = 'https://apis.roblox.com/oauth/v1/userinfo';

const verificationSessions = new Map(); // state -> { userId, guildId }

/* ───────────────────────────── */
/* Express OAuth Callback Server */
/* ───────────────────────────── */

const app = express();

app.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code || !state) {
        return res.send(page('❌ Invalid Request', 'Missing code or state. Please try verifying again in Discord.', '#e74c3c'));
    }

    const session = verificationSessions.get(state);
    if (!session) {
        return res.send(page('❌ Session Expired', 'Your verification link has expired. Please click Verify again in Discord.', '#e74c3c'));
    }
    verificationSessions.delete(state);

    let tokenData;
    try {
        const tokenRes = await fetch(ROBLOX_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type:    'authorization_code',
                code,
                redirect_uri:  REDIRECT_URI,
                client_id:     process.env.ROBLOX_CLIENT_ID,
                client_secret: process.env.ROBLOX_CLIENT_SECRET
            })
        });
        tokenData = await tokenRes.json();
    } catch (err) {
        console.error('Token exchange error:', err);
        return res.send(page('❌ Error', 'Could not reach Roblox. Please try again later.', '#e74c3c'));
    }

    if (!tokenData.access_token) {
        console.error('No access token:', tokenData);
        return res.send(page('❌ Auth Failed', 'Roblox did not return a valid token. Please try again.', '#e74c3c'));
    }

    let userInfo;
    try {
        const userRes = await fetch(ROBLOX_USER_URL, {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        userInfo = await userRes.json();
    } catch (err) {
        console.error('User info error:', err);
        return res.send(page('❌ Error', 'Could not fetch your Roblox profile. Please try again.', '#e74c3c'));
    }

    const robloxUsername = userInfo.preferred_username || userInfo.name || 'Unknown';

    try {
        const guild  = await client.guilds.fetch(session.guildId);
        const member = await guild.members.fetch(session.userId);

        await member.roles.add(process.env.VERIFIED_ROLE_ID);
        await member.roles.remove(process.env.UNVERIFIED_ROLE_ID);

        try {
            await member.setNickname(robloxUsername);
        } catch (e) {
            console.error('Could not set nickname:', e.message);
        }

        console.log(`✅ Verified ${member.user.tag} as Roblox user "${robloxUsername}"`);
        return res.send(page('✅ Verified!', `You are now verified as <strong>${robloxUsername}</strong>.<br>You can close this tab and return to Discord.`, '#2ecc71'));
    } catch (err) {
        console.error('Discord update error:', err);
        return res.send(page('❌ Discord Error', 'Could not update your Discord roles. Please contact a staff member.', '#e74c3c'));
    }
});

app.listen(3000, '0.0.0.0', () => {
    console.log(`✅ OAuth server listening — redirect URI: ${REDIRECT_URI}`);
});

function page(title, message, color) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#0f0f1a;color:#fff;
         display:flex;align-items:center;justify-content:center;min-height:100vh}
    .card{background:#1a1a2e;border-radius:16px;padding:48px 40px;text-align:center;
          max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.4)}
    .icon{font-size:56px;margin-bottom:16px}
    h1{font-size:1.6rem;margin-bottom:12px;color:${color}}
    p{color:#aaa;line-height:1.6}
    strong{color:#fff}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${title.startsWith('✅') ? '✅' : '❌'}</div>
    <h1>${title.replace(/^[✅❌]\s*/, '')}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

/* ───────────────────────────── */
/* Discord Client                */
/* ───────────────────────────── */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

/* ───────────────────────────── */
/* Slash Commands                */
/* ───────────────────────────── */

const commands = [

    new SlashCommandBuilder()
        .setName('verifypanel')
        .setDescription('Send verify panel'),

    new SlashCommandBuilder()
        .setName('applypanel')
        .setDescription('Send staff application panel'),

    new SlashCommandBuilder()
        .setName('giverank')
        .setDescription('Give a staff role')
        .addUserOption(o =>
            o.setName('user')
             .setDescription('User')
             .setRequired(true)
        )
        .addRoleOption(o =>
            o.setName('role')
             .setDescription('Role to give')
             .setRequired(true)
        )

].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            { body: commands }
        );
        console.log('✅ Slash commands loaded');
    } catch (err) {
        console.error(err);
    }
})();

/* ───────────────────────────── */
/* Ready → Send Verify Panel    */
/* ───────────────────────────── */

client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}`);

    try {
        const channel = await client.channels.fetch(process.env.VERIFY_CHANNEL_ID);

        const recent = await channel.messages.fetch({ limit: 20 });
        const alreadySent = recent.some(msg =>
            msg.author.id === client.user.id &&
            msg.components.length > 0 &&
            msg.components[0].components.some(c => c.customId === 'verify_btn')
        );

        if (!alreadySent) {
            const embed = new EmbedBuilder()
                .setTitle('Server Verification')
                .setDescription('Click **Verify** below to link your Roblox account and gain access to the server.')
                .setColor('Green');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_btn')
                    .setLabel('Verify')
                    .setStyle(ButtonStyle.Success)
            );

            await channel.send({ embeds: [embed], components: [row] });
            console.log('✅ Verify panel sent to channel');
        } else {
            console.log('ℹ️ Verify panel already present, skipping');
        }
    } catch (err) {
        console.error('Failed to send verify panel:', err.message);
    }
});

/* ───────────────────────────── */
/* Member Join → Unverified     */
/* ───────────────────────────── */

client.on(Events.GuildMemberAdd, async member => {
    try {
        await member.roles.add(process.env.UNVERIFIED_ROLE_ID);
    } catch (err) {
        console.error('Could not assign unverified role:', err.message);
    }
});

/* ───────────────────────────── */
/* Interactions                  */
/* ───────────────────────────── */

client.on(Events.InteractionCreate, async interaction => {

    /* ───────── SLASH COMMANDS ───────── */

    if (interaction.isChatInputCommand()) {

        /* VERIFY PANEL */
        if (interaction.commandName === 'verifypanel') {

            const embed = new EmbedBuilder()
                .setTitle('Server Verification')
                .setDescription('Click **Verify** below to link your Roblox account and gain access to the server.')
                .setColor('Green');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_btn')
                    .setLabel('Verify')
                    .setStyle(ButtonStyle.Success)
            );

            const channel = await client.channels.fetch(process.env.VERIFY_CHANNEL_ID);
            await channel.send({ embeds: [embed], components: [row] });

            return interaction.reply({ content: 'Verify panel sent', ephemeral: true });
        }

        /* APPLY PANEL */
        if (interaction.commandName === 'applypanel') {

            const embed = new EmbedBuilder()
                .setTitle('Staff Application')
                .setDescription('Click below to apply for staff.')
                .setColor('Blue');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('apply_btn')
                    .setLabel('Apply')
                    .setStyle(ButtonStyle.Primary)
            );

            const channel = await client.channels.fetch(process.env.APPLICATION_CHANNEL_ID);
            await channel.send({ embeds: [embed], components: [row] });

            return interaction.reply({ content: 'Application panel sent', ephemeral: true });
        }

        /* GIVE RANK */
        if (interaction.commandName === 'giverank') {

            const user   = interaction.options.getUser('user');
            const role   = interaction.options.getRole('role');
            const member = await interaction.guild.members.fetch(user.id);

            await member.roles.add(role);

            return interaction.reply({
                content: `✅ Gave ${role.name} to ${user.tag}`,
                ephemeral: true
            });
        }
    }

    /* ───────── BUTTONS ───────── */

    if (interaction.isButton()) {

        /* VERIFY — redirect to Roblox OAuth */
        if (interaction.customId === 'verify_btn') {

            const state = crypto.randomBytes(16).toString('hex');
            verificationSessions.set(state, {
                userId:  interaction.user.id,
                guildId: interaction.guild.id
            });

            setTimeout(() => verificationSessions.delete(state), 10 * 60 * 1000);

            const params = new URLSearchParams({
                client_id:     process.env.ROBLOX_CLIENT_ID,
                redirect_uri:  REDIRECT_URI,
                scope:         'openid profile',
                response_type: 'code',
                state
            });

            const oauthUrl = `${ROBLOX_AUTH_URL}?${params}`;

            return interaction.reply({
                content: `🔐 **Click the link below to verify your Roblox account:**\n${oauthUrl}\n\n*This link expires in 10 minutes.*`,
                ephemeral: true
            });
        }

        /* APPLY */
        if (interaction.customId === 'apply_btn') {

            const modal = new ModalBuilder()
                .setCustomId('apply_modal')
                .setTitle('Staff Application');

            const q1 = new TextInputBuilder()
                .setCustomId('q1')
                .setLabel('Why do you want staff?')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const q2 = new TextInputBuilder()
                .setCustomId('q2')
                .setLabel('Experience?')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(q1),
                new ActionRowBuilder().addComponents(q2)
            );

            return interaction.showModal(modal);
        }

        /* ACCEPT / DENY APPLICATION */
        if (interaction.customId.startsWith('app_')) {

            const [, action, userId] = interaction.customId.split('_');
            const member = await interaction.guild.members.fetch(userId);

            if (action === 'accept') {
                await member.roles.add(process.env.STAFF_ROLE_ID);
                return interaction.reply({ content: `✅ Accepted <@${userId}>`, ephemeral: true });
            }

            if (action === 'deny') {
                return interaction.reply({ content: `❌ Denied <@${userId}>`, ephemeral: true });
            }
        }
    }

    /* ───────── MODALS ───────── */

    if (interaction.isModalSubmit()) {

        /* APPLICATION SUBMIT */
        if (interaction.customId === 'apply_modal') {

            const q1 = interaction.fields.getTextInputValue('q1');
            const q2 = interaction.fields.getTextInputValue('q2');

            const channel = await client.channels.fetch(process.env.APPLICATION_CHANNEL_ID);

            const embed = new EmbedBuilder()
                .setTitle('New Staff Application')
                .setDescription(`<@${interaction.user.id}>`)
                .addFields(
                    { name: 'Why staff',  value: q1 },
                    { name: 'Experience', value: q2 }
                )
                .setColor('Yellow');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`app_accept_${interaction.user.id}`)
                    .setLabel('Accept')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`app_deny_${interaction.user.id}`)
                    .setLabel('Deny')
                    .setStyle(ButtonStyle.Danger)
            );

            await channel.send({ embeds: [embed], components: [row] });

            return interaction.reply({ content: '✅ Application submitted!', ephemeral: true });
        }
    }
});

/* ───────────────────────────── */

client.login(process.env.TOKEN);
