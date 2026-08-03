import {
    ApplicationCommandType,
    AutocompleteInteraction,
    Client,
    CommandInteraction,
    Events,
    type Awaitable,
    type BaseApplicationCommandData,
    type ChatInputApplicationCommandData,
    type ChatInputCommandInteraction,
    type ClientEvents,
    type MessageApplicationCommandData,
    type MessageContextMenuCommandInteraction,
    type UserApplicationCommandData,
    type UserContextMenuCommandInteraction,
} from "discord.js";
import fs from "node:fs/promises";
import path from "node:path";

process.on("uncaughtException", (err) => console.error(err));

type Handler<T extends CommandInteraction | AutocompleteInteraction> = (interaction: T) => Awaitable<unknown>;

class Command<T extends BaseApplicationCommandData, U extends CommandInteraction, Z extends boolean = false> {
    data: T;
    handler: Handler<U>;
    autocomplete: Handler<AutocompleteInteraction> | null;

    constructor({ handler, ...data }: T & { handler: Handler<U> } & (Z extends true ? { autocomplete?: Handler<AutocompleteInteraction> } : {})) {
        if ("autocomplete" in data) {
            const { autocomplete, ...rest } = data;
            this.autocomplete = autocomplete as Handler<AutocompleteInteraction>;
            this.data = rest as unknown as T;
        } else {
            this.autocomplete = null;
            this.data = data as unknown as T;
        }

        this.handler = handler;
    }
}

export class SlashCommand extends Command<ChatInputApplicationCommandData & { type: ApplicationCommandType.ChatInput }, ChatInputCommandInteraction, true> {}
export class UserCommand extends Command<UserApplicationCommandData, UserContextMenuCommandInteraction> {}
export class MessageCommand extends Command<MessageApplicationCommandData, MessageContextMenuCommandInteraction> {}

export class EventHandler<T extends keyof ClientEvents> {
    event: T;
    handler: (...args: ClientEvents[T]) => unknown;

    constructor({ event, handler }: { event: T; handler: (...args: ClientEvents[T]) => unknown }) {
        this.event = event;
        this.handler = handler;
    }
}

export async function loadCommands(client: Client<true>, directory: string) {
    const files = await fs.readdir(path.resolve(directory), { recursive: false, withFileTypes: true });

    const commandData: (ChatInputApplicationCommandData | UserApplicationCommandData | MessageApplicationCommandData)[] = [];

    const slashCommandHandlers = new Map<string, Handler<ChatInputCommandInteraction>>();
    const userCommandHandlers = new Map<string, Handler<UserContextMenuCommandInteraction>>();
    const messageCommandHandlers = new Map<string, Handler<MessageContextMenuCommandInteraction>>();

    const slashCommandAutocompletes = new Map<string, Handler<AutocompleteInteraction>>();

    await Promise.all(
        files.map(async (file) => {
            const { default: item } = await import(path.resolve(file.parentPath, file.name));

            if (item instanceof SlashCommand) {
                commandData.push(item.data);
                slashCommandHandlers.set(item.data.name, item.handler);
                if (item.autocomplete) slashCommandAutocompletes.set(item.data.name, item.autocomplete);
            } else if (item instanceof UserCommand) {
                commandData.push(item.data);
                userCommandHandlers.set(item.data.name, item.handler);
            } else if (item instanceof MessageCommand) {
                commandData.push(item.data);
                messageCommandHandlers.set(item.data.name, item.handler);
            } else {
                console.warn(`WARN Command loader did not recognize the export from ${file.name} as a command.`);
            }
        }),
    );

    await client.application.commands.set(commandData);

    client.on(Events.InteractionCreate, (interaction) => {
        if (interaction.isChatInputCommand()) slashCommandHandlers.get(interaction.commandName)?.(interaction);
        else if (interaction.isUserContextMenuCommand()) userCommandHandlers.get(interaction.commandName)?.(interaction);
        else if (interaction.isMessageContextMenuCommand()) messageCommandHandlers.get(interaction.commandName)?.(interaction);
        else if (interaction.isAutocomplete()) slashCommandAutocompletes.get(interaction.commandName)?.(interaction);
    });
}

export async function loadInteractions(client: Client<true>, directory: string, argumentSeparator: string = ":") {
    const files = await fs.readdir(path.resolve(directory), { recursive: true, withFileTypes: true });
    const handlers = new Map<string, Function>();

    await Promise.all(
        files.map(async (file) => {
            if (file.isDirectory()) return;

            const absolutePath = path.resolve(file.parentPath, file.name);
            const relativePath = path.relative(path.resolve(directory), absolutePath);

            const { default: handler } = await import(absolutePath).catch(() => null);
            if (typeof handler !== "function") return console.warn(`WARN Command loader did not recognize the export from ${relativePath} as a command.`);

            handlers.set(relativePath.replace(/\.[^/.]+$/, ""), handler);
        }),
    );

    client.on(Events.InteractionCreate, (interaction) => {
        if (!interaction.isMessageComponent() && !interaction.isModalSubmit()) return;

        const [, userId, path, ...args] = interaction.customId.split(argumentSeparator);
        if (!path || (userId && interaction.user.id !== userId)) return;

        handlers.get(path)?.(interaction, ...args);
    });
}

export async function loadEvents(client: Client<true>, directory: string, recursive: boolean = false) {
    const files = await fs.readdir(path.resolve(directory), { recursive, withFileTypes: true });
    const handlers: Partial<{ [K in keyof ClientEvents]: ((...args: ClientEvents[K]) => unknown)[] }> = {};

    await Promise.all(
        files.map(async (file) => {
            if (file.isDirectory()) return;
            const { default: item } = await import(path.resolve(file.parentPath, file.name));
            if (item instanceof EventHandler) (handlers[item.event as keyof ClientEvents] ??= []).push(item.handler);
        }),
    );

    Object.entries(handlers).forEach(([key, handlers]) => client.on(key, (...args) => handlers.forEach((handler) => (handler as any)(...args))));
}
