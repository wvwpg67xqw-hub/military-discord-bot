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

/* ───────────────────────────── */
/* Client                        */
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
/* Ready → Auto-send Verify Panel */
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

        /* VERIFY — show Roblox username modal */
        if (interaction.customId === 'verify_btn') {

            const modal = new ModalBuilder()
                .setCustomId('verify_modal')
                .setTitle('Roblox Verification');

            const input = new TextInputBuilder()
                .setCustomId('username')
                .setLabel('Enter your Roblox username')
                .setStyle(TextInputStyle.Short)
                .setMinLength(3)
                .setMaxLength(20)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));

            return interaction.showModal(modal);
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

        /* VERIFY — look up username against Roblox API */
        if (interaction.customId === 'verify_modal') {

            const member       = interaction.member;
            const inputUsername = interaction.fields.getTextInputValue('username').trim();

            await interaction.deferReply({ ephemeral: true });

            let robloxUsername = null;
            try {
                const res  = await fetch('https://users.roblox.com/v1/usernames/users', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ usernames: [inputUsername], excludeBannedUsers: false })
                });
                const data = await res.json();
                if (data.data && data.data.length > 0) {
                    robloxUsername = data.data[0].name;
                }
            } catch (err) {
                console.error('Roblox API error:', err.message);
                return interaction.editReply({
                    content: '❌ Could not reach the Roblox API. Please try again later.'
                });
            }

            if (!robloxUsername) {
                return interaction.editReply({
                    content: `❌ The Roblox username **${inputUsername}** does not exist. Please check your spelling and try again.`
                });
            }

            await member.roles.add(process.env.VERIFIED_ROLE_ID);
            await member.roles.remove(process.env.UNVERIFIED_ROLE_ID);

            try {
                await member.setNickname(robloxUsername);
            } catch (err) {
                console.error(`Could not set nickname for ${member.user.tag}:`, err.message);
            }

            console.log(`✅ Verified ${member.user.tag} as Roblox user "${robloxUsername}"`);
            return interaction.editReply({
                content: `✅ You are now verified as **${robloxUsername}** on Roblox!`
            });
        }

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
