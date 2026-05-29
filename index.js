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
/* Client */
/* ───────────────────────────── */

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

/* ───────────────────────────── */
/* Slash Commands */
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

        console.log("✅ Slash commands loaded");
    } catch (err) {
        console.error(err);
    }
})();

/* ───────────────────────────── */
/* Ready */
/* ───────────────────────────── */

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user.tag}`);
});

/* ───────────────────────────── */
/* Member Join → Unverified */
/* ───────────────────────────── */

client.on(Events.GuildMemberAdd, async member => {
    await member.roles.add(process.env.UNVERIFIED_ROLE_ID);
});

/* ───────────────────────────── */
/* Interactions */
/* ───────────────────────────── */

client.on(Events.InteractionCreate, async interaction => {

    /* ───────── SLASH COMMANDS ───────── */

    if (interaction.isChatInputCommand()) {

        /* VERIFY PANEL */
        if (interaction.commandName === 'verifypanel') {

            const embed = new EmbedBuilder()
                .setTitle("Server Verification")
                .setDescription("Click verify to gain access.")
                .setColor("Green");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("verify_btn")
                    .setLabel("Verify")
                    .setStyle(ButtonStyle.Success)
            );

            const channel = await client.channels.fetch(
                process.env.VERIFY_CHANNEL_ID
            );

            await channel.send({
                embeds: [embed],
                components: [row]
            });

            return interaction.reply({
                content: "Verify panel sent",
                ephemeral: true
            });
        }

        /* APPLY PANEL */
        if (interaction.commandName === 'applypanel') {

            const embed = new EmbedBuilder()
                .setTitle("Staff Application")
                .setDescription("Click below to apply for staff.")
                .setColor("Blue");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("apply_btn")
                    .setLabel("Apply")
                    .setStyle(ButtonStyle.Primary)
            );

            const channel = await client.channels.fetch(
                process.env.APPLICATION_CHANNEL_ID
            );

            await channel.send({
                embeds: [embed],
                components: [row]
            });

            return interaction.reply({
                content: "Application panel sent",
                ephemeral: true
            });
        }

        /* GIVE RANK */
        if (interaction.commandName === 'giverank') {

            const user = interaction.options.getUser('user');
            const role = interaction.options.getRole('role');

            const member = await interaction.guild.members.fetch(user.id);

            await member.roles.add(role);

            return interaction.reply({
                content: `✅ Gave ${role.name} to ${user.tag}`,
                ephemeral: true
            });
        }
    }

    /* ───────── VERIFY BUTTON ───────── */

    if (interaction.isButton()) {

        /* VERIFY */
        if (interaction.customId === 'verify_btn') {

            const modal = new ModalBuilder()
                .setCustomId("verify_modal")
                .setTitle("Verify Account");

            const input = new TextInputBuilder()
                .setCustomId("username")
                .setLabel("Roblox Username (optional)")
                .setStyle(TextInputStyle.Short)
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder().addComponents(input)
            );

            return interaction.showModal(modal);
        }

        /* APPLY */
        if (interaction.customId === 'apply_btn') {

            const modal = new ModalBuilder()
                .setCustomId("apply_modal")
                .setTitle("Staff Application");

            const q1 = new TextInputBuilder()
                .setCustomId("q1")
                .setLabel("Why do you want staff?")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const q2 = new TextInputBuilder()
                .setCustomId("q2")
                .setLabel("Experience?")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(q1),
                new ActionRowBuilder().addComponents(q2)
            );

            return interaction.showModal(modal);
        }

        /* ACCEPT / DENY APPLICATION */
        if (interaction.customId.startsWith("app_")) {

            const [_, action, userId] = interaction.customId.split("_");

            const guild = interaction.guild;
            const member = await guild.members.fetch(userId);

            if (action === "accept") {
                await member.roles.add(process.env.STAFF_ROLE_ID);

                await interaction.reply({
                    content: `✅ Accepted <@${userId}>`,
                    ephemeral: true
                });
            }

            if (action === "deny") {
                await interaction.reply({
                    content: `❌ Denied <@${userId}>`,
                    ephemeral: true
                });
            }
        }
    }

    /* ───────── MODALS ───────── */

    if (interaction.isModalSubmit()) {

        /* VERIFY COMPLETE */
        if (interaction.customId === "verify_modal") {

            const member = interaction.member;

            await member.roles.add(process.env.VERIFIED_ROLE_ID);
            await member.roles.remove(process.env.UNVERIFIED_ROLE_ID);

            return interaction.reply({
                content: "✅ You are now verified!",
                ephemeral: true
            });
        }

        /* APPLICATION SUBMIT */
        if (interaction.customId === "apply_modal") {

            const q1 = interaction.fields.getTextInputValue("q1");
            const q2 = interaction.fields.getTextInputValue("q2");

            const channel = await client.channels.fetch(
                process.env.APPLICATION_CHANNEL_ID
            );

            const embed = new EmbedBuilder()
                .setTitle("New Staff Application")
                .setDescription(`<@${interaction.user.id}>`)
                .addFields(
                    { name: "Why staff", value: q1 },
                    { name: "Experience", value: q2 }
                )
                .setColor("Yellow");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`app_accept_${interaction.user.id}`)
                    .setLabel("Accept")
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`app_deny_${interaction.user.id}`)
                    .setLabel("Deny")
                    .setStyle(ButtonStyle.Danger)
            );

            await channel.send({
                embeds: [embed],
                components: [row]
            });

            return interaction.reply({
                content: "Application submitted!",
                ephemeral: true
            });
        }
    }
});

/* ───────────────────────────── */

client.login(process.env.TOKEN);