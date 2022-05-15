import { Command } from '../../interfaces';
import {
    ButtonInteraction,
    CommandInteraction,
    Message,
    MessageActionRow,
    MessageButton,
    MessageEmbed,
    MessagePayload,
    User,
    WebhookEditMessageOptions
} from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import BetterClient from '../../client';
import { createEmbed, createErrorEmbed, replyDefer, replyInteraction } from '../../helpers';
import { GameType } from '../../classes/GameManager';
import { GameLobby, GameState } from '../../classes/GameLobby';
import { APIApplicationCommandOptionChoice } from 'discord-api-types/v10';
import {
    Category,
    CategoryData,
    CategoryName,
    CategoryNamesPretty,
    CategoryResolvable,
    getQuestions,
    Question,
    QuestionDifficulties,
    QuestionDifficulty,
    QuestionType,
    QuestionTypes
} from 'easy-trivia';
import { answerDisplayTime, questionAnswerTimeout, TriviaGame } from '../../classes/TriviaGame';

const triviaThumbnail = 'https://opentdb.com/images/logo-banner.png';

export const command: Command = {
    data: new SlashCommandBuilder()
        .setName('trivia')
        .setDescription('Start a game of trivia.')
        .addIntegerOption((option) =>
            option
                .setName('amount')
                .setDescription('How many questions?')
                .setMinValue(1)
                .setMaxValue(50)
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName('difficulty')
                .setDescription('What difficulty?')
                .addChoices(
                    { name: 'easy', value: 'easy' },
                    { name: 'medium', value: 'medium' },
                    { name: 'hard', value: 'hard' }
                )
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName('type')
                .setDescription('What type?')
                .addChoices({ name: 'yes / no', value: 'boolean' }, { name: 'multiple choice', value: 'multiple' })
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName('category')
                .setDescription('Which category?')
                .addChoices(...getCategoryOptions())
                .setRequired(false)
        )
        .addIntegerOption((option) =>
            option
                .setName('players')
                .setDescription('How many players can join?')
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(false)
        ),
    run: (
        client: BetterClient,
        interaction?: CommandInteraction | ButtonInteraction,
        message?: Message,
        args?: string[]
    ) =>
        new Promise<void>(async (done, error) => {
            if (interaction instanceof CommandInteraction) {
                try {
                    await replyDefer(interaction);

                    let amount = interaction.options.getInteger('amount');
                    let difficulty = interaction.options.getString('difficulty');
                    if (!difficulty) difficulty = null;
                    let type = interaction.options.getString('type');
                    if (!type) type = null;
                    let category = interaction.options.getString('category');
                    if (!category) category = null;
                    let maxPlayers = interaction.options.getInteger('players');
                    if (!maxPlayers) maxPlayers = 10;

                    const lobby = (await client.gameManager.createLobby(
                        GameType.Trivia,
                        interaction,
                        interaction.user,
                        1,
                        maxPlayers
                    )) as TriviaGame;
                    lobby.amount = amount!;
                    lobby.difficulty = <QuestionDifficulty>difficulty!;
                    lobby.type = <QuestionType>type!;
                    lobby.category = new Category(<CategoryResolvable>category!);

                    // A PLAYER JOINED
                    lobby.on('join', async (game: TriviaGame) => {
                        console.log(`[Trivia] ${game.players[game.players.length - 1].username} joined`);
                        let embedmsg = getLobbyMessageEmbed(game, '`Waiting for more players...`');
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
                                await button.deferUpdate();
                                if (button.user.id === interaction.user.id) {
                                    if (button.customId === 'join_cancel') {
                                        let embedmsg = getLobbyMessageEmbed(game, '`The game was canceled.`');
                                        await interaction.editReply({ embeds: [embedmsg], components: [] });

                                        client.gameManager.destroyLobby(interaction.user);
                                        collector.stop();
                                    }
                                } else {
                                    if (button.customId === 'join_join') {
                                        game.join(button.user);
                                        collector.stop();
                                    } else if (button.customId === 'join_cancel') {
                                        await button.reply(createErrorEmbed("`⛔ This button isn't for you.`", true));
                                    }
                                }
                            } catch (err) {
                                console.log(err);
                            }
                        });

                        collector.on('end', async (_: any, reason: string) => {
                            try {
                                if (
                                    reason === 'time' &&
                                    (game.state === GameState.Waiting || game.state === GameState.Ready)
                                ) {
                                    let embedmsg = getLobbyMessageEmbed(game, '`The game lobby timed out.`');
                                    await interaction.editReply({ embeds: [embedmsg], components: [] });
                                    client.gameManager.destroyLobby(interaction.user);
                                }
                            } catch (err) {
                                console.log(err);
                            }
                        });

                        await interaction.editReply({ embeds: [embedmsg], components: [row] });
                    });

                    // GAME READY TO START
                    lobby.on('ready', async (game: TriviaGame) => {
                        console.log('[Trivia] Ready');
                        let embedmsg = getLobbyMessageEmbed(game, '`Minimum player count reached. The game is ready.`');
                        const row = new MessageActionRow().addComponents([
                            new MessageButton().setCustomId('ready_join').setLabel('Join').setStyle('PRIMARY'),
                            new MessageButton().setCustomId('ready_cancel').setLabel('Cancel Game').setStyle('DANGER'),
                            new MessageButton().setCustomId('ready_start').setLabel('Start Game').setStyle('SUCCESS')
                        ]);
                        const collector = interaction.channel!.createMessageComponentCollector({
                            componentType: 'BUTTON',
                            time: game.interactionTimeout
                        });

                        collector.on('collect', async (button) => {
                            try {
                                if (button.user.id === interaction.user.id) {
                                    await button.deferUpdate();
                                    if (button.customId === 'ready_start') {
                                        game.start();
                                    } else if (button.customId === 'ready_cancel') {
                                        let embedmsg = getLobbyMessageEmbed(game, '`The game was canceled.`');
                                        await interaction.editReply({ embeds: [embedmsg], components: [] });

                                        client.gameManager.destroyLobby(interaction.user);
                                    }
                                    collector.stop();
                                } else {
                                    try {
                                        if (button.customId === 'ready_join') {
                                            await button.deferUpdate();
                                            game.join(button.user);
                                            collector.stop();
                                        } else {
                                            await button.reply(
                                                createErrorEmbed("`⛔ This button isn't for you.`", true)
                                            );
                                        }
                                    } catch (err) {
                                        console.log(err);
                                    }
                                }
                            } catch (err) {
                                console.log(err);
                            }
                        });

                        collector.on('end', async (_: any, reason: string) => {
                            try {
                                if (
                                    reason === 'time' &&
                                    (game.state === GameState.Waiting || game.state === GameState.Ready)
                                ) {
                                    let embedmsg = getLobbyMessageEmbed(game, '`The game lobby timed out.`');
                                    await interaction.editReply({ embeds: [embedmsg], components: [] });
                                    client.gameManager.destroyLobby(interaction.user);
                                }
                            } catch (err) {
                                console.log(err);
                            }
                        });

                        await interaction.editReply({ embeds: [embedmsg], components: [row] });
                    });

                    // GAME QUESTION
                    lobby.on('question', async (game: TriviaGame) => {
                        console.log('[Trivia] Game Question');
                        const gameMessage = getQuestionMessage(game);
                        await interaction.editReply(gameMessage);

                        const collector = interaction.channel!.createMessageComponentCollector({
                            componentType: 'BUTTON',
                            time: questionAnswerTimeout
                        });

                        collector.on('collect', async (button) => {
                            try {
                                if (game.answerRequired.includes(button.user)) {
                                    await button.deferUpdate();
                                    game.answerQuestion(button.user, parseInt(button.customId.replace('trivia_', '')));
                                    collector.stop();
                                } else {
                                    try {
                                        if (game.answerGiven.includes(button.user)) {
                                            await button.reply(
                                                createErrorEmbed(
                                                    "`💤 You've already answered. Wait for your opponents.`",
                                                    true
                                                )
                                            );
                                        } else {
                                            await button.reply(
                                                createErrorEmbed("`⛔ These buttons aren't for you.`", true)
                                            );
                                        }
                                    } catch (err) {
                                        console.log(err);
                                    }
                                }
                            } catch (err) {
                                console.log(err);
                            }
                        });

                        collector.on('end', async (_: any, reason: string) => {
                            try {
                                if (reason === 'time' && game.answerGiven.length == 0) {
                                    if (game.answerGiven.length == 0) {
                                        let embedmsg = getLobbyMessageEmbed(
                                            game,
                                            'No one has answered. The game is closed.`'
                                        );
                                        await interaction.editReply({ embeds: [embedmsg], components: [] });

                                        client.gameManager.destroyLobby(interaction.user);
                                    } else {
                                        game.nextRound();
                                    }
                                }
                            } catch (err) {
                                console.log(err);
                            }
                        });
                    });

                    // GAME ANSWER
                    lobby.on('answer', async (game: TriviaGame) => {
                        console.log('[Trivia] Game Answer');
                        const gameMessage = getAnswerMessage(game);
                        await interaction.editReply(gameMessage);

                        const collector = interaction.channel!.createMessageComponentCollector({
                            componentType: 'BUTTON',
                            time: answerDisplayTime
                        });

                        collector.on('end', async (_: any, reason: string) => {
                            try {
                                if (reason === 'time') {
                                    game.nextRound();
                                }
                            } catch (err) {
                                console.log(err);
                            }
                        });
                    });

                    // GAME OVER
                    lobby.on('end', async (game: TriviaGame) => {
                        console.log('[Trivia] Game Over');
                        const gameMessage = getGameOverMessage(game);
                        await interaction.editReply(gameMessage);
                        client.gameManager.destroyLobby(interaction.user);
                    });

                    // open game lobby
                    lobby.open();
                    done();
                } catch (err) {
                    try {
                        await replyInteraction(
                            interaction,
                            createErrorEmbed('🚩 Error creating a tic tac toe game: `' + err + '`')
                        );
                    } catch (err2) {
                        console.log(err2);
                    }
                    console.log(err);
                    error(err);
                }
            }
        })
};

function getLobbyMessageEmbed(game: GameLobby, message: string) {
    let players = '';
    game.players.forEach((player) => {
        players = players + '<@' + player.id + '> ';
    });
    return new MessageEmbed()
        .setColor('#403075')
        .setTitle('Trivia')
        .setDescription(message)
        .setThumbnail(triviaThumbnail)
        .addField(`Players: ${game.players.length} of ${game.maxPlayers} [min ${game.minPlayers}]`, players);
}

function getQuestionMessage(game: TriviaGame): string | MessagePayload | WebhookEditMessageOptions {
    let requiredPlayers = '';
    let answeredPlayers = '';
    game.answerRequired.forEach((player) => {
        requiredPlayers = requiredPlayers + '<@' + player.id + '> ';
    });
    game.answerGiven.forEach((player) => {
        answeredPlayers = answeredPlayers + '<@' + player.id + '> ';
    });

    let embedmsg = new MessageEmbed()
        .setColor('#403075')
        .setTitle('Trivia')
        .setDescription('Question: `' + game.question!.value + '`')
        .addField('Category:', game.question!.category, true)
        .addField('Difficulty:', game.question!.difficulty, true)
        .addField('Time:', game.question!.difficulty, true)
        .addField('Answer awaited:', requiredPlayers, false)
        .addField('Answer given:', String(questionAnswerTimeout / 1000) + ' seconds', false);

    let rows = [];
    for (let i = 0; i < game.question!.allAnswers!.length!; i++) {
        rows.push(
            new MessageActionRow().addComponents([
                new MessageButton()
                    .setCustomId('trivia_' + String(i))
                    .setLabel(String(i) + ': ' + game.question?.allAnswers[i])
                    .setStyle('PRIMARY')
            ])
        );
    }
    return {
        content: ' ',
        embeds: [embedmsg],
        components: rows
    };
}

function getAnswerMessage(game: TriviaGame): string | MessagePayload | WebhookEditMessageOptions {
    let embedmsg = new MessageEmbed()
        .setColor('#403075')
        .setTitle('Trivia')
        .setDescription(
            'Question: `' + game.question!.value + '`\n' + 'Answer: `' + game.question!.correctAnswer + '`'
        );
    return {
        content: ' ',
        embeds: [embedmsg],
        components: []
    };
}

function getGameOverMessage(game: TriviaGame): string | MessagePayload | WebhookEditMessageOptions {
    let stats = new Map<User, number>();

    for (let [key, value] of game.answers) {
        let score = 0;
        value.forEach((answer) => {
            score = score + Number(answer);
        });
        stats.set(key, score);
    }
    const sortedStats = new Map([...stats.entries()].sort((a, b) => b[1] - a[1]));

    let embedmsg = new MessageEmbed()
        .setColor('#403075')
        .setTitle('Trivia')
        .setDescription('🎉 <@' + [...sortedStats][0][0].id + '> has won the game!');

    for (let [key, value] of sortedStats) {
        embedmsg.addField('<@' + key.id + '>', String(value) + ' Points');
    }

    return {
        content: ' ',
        embeds: [embedmsg],
        components: []
    };
}

function getCategoryOptions(): APIApplicationCommandOptionChoice<string>[] {
    let options = [];
    for (let item in CategoryNamesPretty) {
        if (isNaN(Number(item))) {
            options.push({ name: item, value: item });
        }
    }
    return options;
}
