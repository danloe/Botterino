import { ButtonInteraction, CommandInteraction, Message } from 'discord.js';
import BetterClient from '../client';

interface Run {
    (client: BetterClient, interaction?: CommandInteraction | ButtonInteraction, message?: Message, args?: string[]);
}

export interface Command {
    data: any;
    run: Run;
}
