import { Command } from '../../interfaces';
import { ButtonInteraction, CommandInteraction, Message } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import BotterinoClient from '../../client';
import { createEmbed, createErrorEmbed, safeDeferReply, safeReply } from '../../helpers';

export const command: Command = {
    data: new SlashCommandBuilder()
        .setName('repeat')
        .setDescription('Enable/Disable repeat for the current track.')
        .addBooleanOption((option) => option.setName('set').setDescription('Enable?').setRequired(false)),
    run: (
        client: BotterinoClient,
        interaction?: CommandInteraction | ButtonInteraction,
        message?: Message,
        args?: string[]
    ) =>
        new Promise<void>(async (done, error) => {
            if (interaction) {
                try {
                    let input =
                        interaction instanceof CommandInteraction ? interaction.options.getBoolean('set') : null;
                    if (interaction instanceof ButtonInteraction) {
                        let subscription = client.musicManager.getSubscription(interaction.guildId!);
                        subscription.repeat = !subscription.repeat;
                    }

                    let status = await client.musicManager.repeat(interaction.guildId!, input);

                    let message = '';
                    if (input !== null) {
                        message = '`🔺 Is now turned ' + (status ? 'on`' : 'off`');
                    } else {
                        message = '`🔺 Is turned ' + (status ? 'on`' : 'off`');
                    }

                    if (interaction instanceof CommandInteraction) {
                        await safeReply(client, interaction, createEmbed('Repeat', message, true));
                    } else {
                        await safeDeferReply(client, interaction);
                    }

                    done();
                } catch (err) {
                    await safeReply(
                        client,
                        interaction,
                        createErrorEmbed('🚩 Error setting repeat: `' + err + '`', true)
                    );
                    error(err);
                }
            }
        })
};
