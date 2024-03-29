import { Command } from '../../interfaces';
import {
    ButtonInteraction,
    CommandInteraction,
    Message,
    MessageActionRow,
    MessageButton,
    MessageEmbed,
    MessagePayload,
    WebhookEditMessageOptions
} from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import BotterinoClient from '../../client';
import { createErrorEmbed, safeDeferReply, safeReply } from '../../helpers';
import { FourWinsGame, GameType, GameState, Logger } from '../../classes';

export const command: Command = {
    data: new SlashCommandBuilder()
        .setName('fourwins')
        .setDescription('Start a game of Four Wins.')
        .addUserOption((option) =>
            option.setName('opponent').setDescription('Do you want to challenge a specific user?').setRequired(false)
        ),
    run: (
        client: BotterinoClient,
        interaction?: CommandInteraction | ButtonInteraction,
        message?: Message,
        args?: string[]
    ) =>
        new Promise<void>(async (done, error) => {
            if (interaction instanceof CommandInteraction) {
                try {
                    await safeDeferReply(client, interaction);

                    let opponent = interaction.options.getUser('opponent');

                    const lobby = (await client.gameManager.createLobby(
                        GameType.FourWins,
                        interaction,
                        interaction.user
                    )) as FourWinsGame;

                    // A PLAYER JOINED
                    lobby.on('join', async (game: FourWinsGame) => {
                        let embedmsg = game.getLobbyMessageEmbed('`Waiting for more players...`');
                        const row = new MessageActionRow().addComponents([
                            new MessageButton().setCustomId('join_join').setLabel('Join').setStyle('PRIMARY'),
                            new MessageButton().setCustomId('join_cancel').setLabel('Cancel Game').setStyle('DANGER')
                        ]);
                        const collector = interaction.channel!.createMessageComponentCollector({
                            componentType: 'BUTTON',
                            time: game.interactionTimeout
                        });

                        collector.on('collect', async (button) => {
                            try {
                                if (button.user.id === interaction.user.id) {
                                    await button.deferUpdate();
                                    if (button.customId === 'join_cancel') {
                                        client.gameManager.destroyLobby(interaction.user, game);
                                        let embedmsg = game.getLobbyMessageEmbed('`The game was canceled.`');
                                        await safeReply(client, interaction, { embeds: [embedmsg], components: [] });
                                    } else {
                                        game.join(button.user);
                                    }
                                    collector.stop();
                                } else {
                                    if (button.customId === 'join_join') {
                                        await button.deferUpdate();
                                        game.join(button.user);
                                        collector.stop();
                                    } else if (button.customId === 'join_cancel') {
                                        await safeReply(
                                            client,
                                            button,
                                            createErrorEmbed("`⛔ This button isn't for you.`", true)
                                        );
                                    }
                                }
                            } catch (err: any) {
                                Logger.error(err);
                            }
                        });

                        collector.on('end', async (_: any, reason: string) => {
                            try {
                                if (
                                    reason === 'time' &&
                                    (game.state === GameState.Waiting || game.state === GameState.Ready)
                                ) {
                                    client.gameManager.destroyLobby(interaction.user, game);
                                    let embedmsg = game.getLobbyMessageEmbed('`The game lobby timed out.`');
                                    await safeReply(client, interaction, { embeds: [embedmsg], components: [] });
                                }
                            } catch (err: any) {
                                Logger.error(err);
                            }
                        });

                        await safeReply(client, interaction, { embeds: [embedmsg], components: [row] });
                    });

                    // GAME READY TO START
                    lobby.on('ready', async (game: FourWinsGame) => {
                        let embedmsg = game.getLobbyMessageEmbed('`Minimum player count reached. The game is ready.`');
                        const row = new MessageActionRow().addComponents([
                            new MessageButton().setCustomId('fw_ready_join').setLabel('Join').setStyle('PRIMARY'),
                            new MessageButton()
                                .setCustomId('fw_ready_cancel')
                                .setLabel('Cancel Game')
                                .setStyle('DANGER'),
                            new MessageButton().setCustomId('fw_ready_start').setLabel('Start Game').setStyle('SUCCESS')
                        ]);
                        const collector = interaction.channel!.createMessageComponentCollector({
                            componentType: 'BUTTON',
                            time: game.interactionTimeout
                        });

                        collector.on('collect', async (button) => {
                            try {
                                if (button.user.id === interaction.user.id) {
                                    await button.deferUpdate();
                                    if (button.customId === 'fw_ready_start') {
                                        game.start();
                                    } else if (button.customId === 'fw_ready_cancel') {
                                        client.gameManager.destroyLobby(interaction.user, game);
                                        let embedmsg = game.getLobbyMessageEmbed('`The game was canceled.`');
                                        await safeReply(client, interaction, { embeds: [embedmsg], components: [] });
                                    } else {
                                        game.join(button.user);
                                    }
                                    collector.stop();
                                } else {
                                    try {
                                        if (button.customId === 'fw_ready_join') {
                                            await button.deferUpdate();
                                            game.join(button.user);
                                            collector.stop();
                                        } else {
                                            await safeReply(
                                                client,
                                                button,
                                                createErrorEmbed("`⛔ This button isn't for you.`", true)
                                            );
                                        }
                                    } catch (err: any) {
                                        Logger.error(err);
                                    }
                                }
                            } catch (err: any) {
                                Logger.error(err);
                            }
                        });

                        collector.on('end', async (_: any, reason: string) => {
                            try {
                                if (
                                    reason === 'time' &&
                                    (game.state === GameState.Waiting || game.state === GameState.Ready)
                                ) {
                                    client.gameManager.destroyLobby(interaction.user, game);
                                    let embedmsg = game.getLobbyMessageEmbed('`The game lobby timed out.`');
                                    await safeReply(client, interaction, { embeds: [embedmsg], components: [] });
                                }
                            } catch (err: any) {
                                Logger.error(err);
                            }
                        });

                        await safeReply(client, interaction, {
                            content: '<@' + lobby.host.id + '>',
                            embeds: [embedmsg],
                            components: [row]
                        });
                    });

                    // GAME STARTED
                    lobby.on('start', async (game: FourWinsGame) => {
                        const gameFieldMessage = getGameFieldMessage(game);
                        await safeReply(client, interaction, gameFieldMessage);

                        const collector = interaction.channel!.createMessageComponentCollector({
                            componentType: 'BUTTON',
                            time: game.interactionTimeout
                        });

                        collector.on('collect', async (button) => {
                            try {
                                if (button.user.id === game.getTurnPlayer().id) {
                                    await button.deferUpdate();
                                    game.placeMark(parseInt(button.customId.replace('fw_', '')));
                                    collector.stop();
                                } else {
                                    try {
                                        if (game.players.includes(button.user)) {
                                            await safeReply(
                                                client,
                                                button,
                                                createErrorEmbed("`💤 It is the other player's turn.`", true)
                                            );
                                        } else {
                                            await safeReply(
                                                client,
                                                button,
                                                createErrorEmbed("`⛔ These buttons aren't for you.`", true)
                                            );
                                        }
                                    } catch (err: any) {
                                        Logger.error(err);
                                    }
                                }
                            } catch (err: any) {
                                Logger.error(err);
                            }
                        });

                        collector.on('end', async (_: any, reason: string) => {
                            try {
                                if (reason === 'time' && game.state === GameState.Started) {
                                    let embedmsg = game.getLobbyMessageEmbed(
                                        '<@' +
                                            game.getTurnPlayer().id +
                                            '>` has not executed his move. The game is closed.`'
                                    );
                                    client.gameManager.destroyLobby(interaction.user, game);
                                    await safeReply(client, interaction, { embeds: [embedmsg], components: [] });
                                }
                            } catch (err: any) {
                                Logger.error(err);
                            }
                        });
                    });

                    // GAME TICK
                    lobby.on('tick', async (game: FourWinsGame) => {
                        const gameFieldMessage = getGameFieldMessage(game);
                        await safeReply(client, interaction, gameFieldMessage);

                        const collector = interaction.channel!.createMessageComponentCollector({
                            componentType: 'BUTTON',
                            time: game.interactionTimeout
                        });

                        collector.on('collect', async (button) => {
                            try {
                                if (button.user.id === game.getTurnPlayer().id) {
                                    await button.deferUpdate();
                                    game.placeMark(parseInt(button.customId.replace('fw_', '')));
                                    collector.stop();
                                } else {
                                    1;
                                    try {
                                        if (game.players.includes(button.user)) {
                                            await safeReply(
                                                client,
                                                button,
                                                createErrorEmbed("`💤 It is the other player's turn.`", true)
                                            );
                                        } else {
                                            await safeReply(
                                                client,
                                                button,
                                                createErrorEmbed("`⛔ These buttons aren't for you.`", true)
                                            );
                                        }
                                    } catch (err: any) {
                                        Logger.error(err);
                                    }
                                }
                            } catch (err: any) {
                                Logger.error(err);
                            }
                        });

                        collector.on('end', async (_: any, reason: string) => {
                            try {
                                if (reason === 'time' && game.state === GameState.Started) {
                                    let embedmsg = game.getLobbyMessageEmbed(
                                        '<@' +
                                            game.getTurnPlayer().id +
                                            '> `has not executed his move. The game is closed.`'
                                    );
                                    client.gameManager.destroyLobby(interaction.user, game);
                                    await safeReply(client, interaction, { embeds: [embedmsg], components: [] });
                                }
                            } catch (err: any) {
                                Logger.error(err);
                            }
                        });
                    });

                    // GAME OVER
                    lobby.on('end', async (game: FourWinsGame) => {
                        const gameFieldMessage = getGameFieldMessage(game, true);
                        await safeReply(client, interaction, gameFieldMessage);

                        if (game.winners.length > 0) {
                            let embedmsg = new MessageEmbed()
                                .setColor('#403075')
                                .setTitle('Four Wins - Game Over')
                                .setDescription('🎉 <@' + game.winners[0].id + '> `has won the game!`')
                                .setThumbnail(game.thumbnail);
                            await interaction.followUp({ embeds: [embedmsg] });
                        } else {
                            client.gameManager.destroyLobby(interaction.user, game);
                            let embedmsg = new MessageEmbed()
                                .setColor('#403075')
                                .setTitle('Four Wins - Game Over')
                                .setDescription('`🫱🏼‍🫲🏼 Draw`')
                                .setThumbnail(game.thumbnail);
                            await interaction.followUp({ embeds: [embedmsg] });
                        }
                    });

                    if (opponent) {
                        // Send a challenge message
                        await safeReply(
                            client,
                            interaction,
                            lobby.getChallengeMessage(
                                opponent,
                                '⚔️ <@' + interaction.user.id + '> `challenged you to a game of Four Wins!`'
                            )
                        );

                        const collector = interaction.channel!.createMessageComponentCollector({
                            componentType: 'BUTTON',
                            time: lobby.interactionTimeout
                        });

                        collector.on('collect', async (button) => {
                            try {
                                if (button.user.id === opponent!.id) {
                                    if (button.customId === 'challenge_accept') {
                                        await button.deferUpdate();

                                        lobby.join(button.user);
                                        collector.stop();
                                    } else if (button.customId === 'challenge_decline') {
                                        await button.deferUpdate();

                                        client.gameManager.destroyLobby(interaction.user, lobby);
                                        let embedmsg = lobby.getLobbyMessageEmbed('`The game challenge was declined.`');
                                        await safeReply(client, interaction, {
                                            content: ' ',
                                            embeds: [embedmsg],
                                            components: []
                                        });

                                        collector.stop();
                                    }
                                } else {
                                    try {
                                        await safeReply(
                                            client,
                                            button,
                                            createErrorEmbed("`⛔ These buttons aren't for you.`", true)
                                        );
                                    } catch (err: any) {
                                        Logger.error(err);
                                    }
                                }
                            } catch (err: any) {
                                Logger.error(err);
                            }
                        });

                        collector.on('end', async (_: any, reason: string) => {
                            try {
                                if (reason === 'time' && lobby.state === GameState.Waiting) {
                                    client.gameManager.destroyLobby(interaction.user, lobby);
                                    let embedmsg = lobby.getLobbyMessageEmbed(
                                        '<@' + opponent!.id + '> `has not accepted the challenge. The game is closed.`'
                                    );
                                    await safeReply(client, interaction, {
                                        content: ' ',
                                        embeds: [embedmsg],
                                        components: []
                                    });
                                }
                            } catch (err: any) {
                                Logger.error(err);
                            }
                        });
                    } else {
                        // open game lobby
                        lobby.open();
                    }
                    done();
                } catch (err: any) {
                    await safeReply(
                        client,
                        interaction,
                        createErrorEmbed('🚩 Error creating a Four Wins game: `' + err + '`', true)
                    );
                    error(err);
                }
            }
        })
};

function getGameFieldMessage(
    game: FourWinsGame,
    noButtons: boolean = false
): string | MessagePayload | WebhookEditMessageOptions {
    let fieldString = '';
    for (let y = 0; y < game.gameField.length; y++) {
        for (let x = 0; x < game.gameField[0].length; x++) {
            fieldString = fieldString + game.gameField[y][x];
        }
        fieldString = fieldString + '\n';
    }
    fieldString = fieldString + '1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣';
    let embedmsg = new MessageEmbed()
        .setColor('#403075')
        .setTitle('Four Wins')
        .setDescription(
            '<@' +
                game.players[0].id +
                '>`' +
                game.charRed +
                ' vs ' +
                game.charYellow +
                '`<@' +
                game.players[1].id +
                '>'
        )
        .addField(
            `Player Turn`,
            `<@${game.playerYellowTurn ? game.players[1].id : game.players[0].id}> ${
                game.playerYellowTurn ? game.charYellow : game.charRed
            }`
        )
        .addField('\u200B', fieldString);
    const row1 = new MessageActionRow().addComponents([
        new MessageButton()
            .setCustomId('fw_0')
            .setLabel('1️⃣')
            .setStyle('SECONDARY')
            .setDisabled(game.gameField[0][0] !== game.charField),
        new MessageButton()
            .setCustomId('fw_1')
            .setLabel('2️⃣')
            .setStyle('SECONDARY')
            .setDisabled(game.gameField[0][1] !== game.charField),
        new MessageButton()
            .setCustomId('fw_2')
            .setLabel('3️⃣')
            .setStyle('SECONDARY')
            .setDisabled(game.gameField[0][2] !== game.charField),
        new MessageButton()
            .setCustomId('fw_3')
            .setLabel('4️⃣')
            .setStyle('SECONDARY')
            .setDisabled(game.gameField[0][3] !== game.charField)
    ]);
    const row2 = new MessageActionRow().addComponents([
        new MessageButton()
            .setCustomId('fw_4')
            .setLabel('5️⃣')
            .setStyle('SECONDARY')
            .setDisabled(game.gameField[0][4] !== game.charField),
        new MessageButton()
            .setCustomId('fw_5')
            .setLabel('6️⃣')
            .setStyle('SECONDARY')
            .setDisabled(game.gameField[0][5] !== game.charField),
        new MessageButton()
            .setCustomId('fw_6')
            .setLabel('7️⃣')
            .setStyle('SECONDARY')
            .setDisabled(game.gameField[0][6] !== game.charField)
    ]);
    return {
        content: ' ',
        embeds: [embedmsg],
        components: noButtons ? [] : [row1, row2]
    };
}
