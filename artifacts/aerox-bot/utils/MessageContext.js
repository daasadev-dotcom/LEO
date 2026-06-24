/**
 * MessageContext — bridges a Discord Message to the Interaction interface
 * used by slash command execute functions, so prefix commands can reuse
 * the same handlers without duplicating logic.
 *
 * Components V2 containers (ContainerBuilder, TextDisplayBuilder, etc.) are
 * extracted to plain text for message-based replies since interaction tokens
 * are required for full component rendering.
 */

function extractText(components) {
    const lines = [];
    for (const comp of components || []) {
        if (!comp || !comp.data) continue;
        if (typeof comp.data.content === 'string') {
            lines.push(comp.data.content);
        }
        if (Array.isArray(comp.data.components)) {
            lines.push(...extractText(comp.data.components));
        }
    }
    return lines;
}

function resolveReplyPayload(payload) {
    if (!payload) return { content: '✅ Done.' };
    if (typeof payload === 'string') return { content: payload };

    const { content, components, embeds } = payload;
    const parts = [];

    if (content) parts.push(content);

    if (Array.isArray(components) && components.length > 0) {
        const extracted = extractText(components);
        if (extracted.length > 0) parts.push(extracted.join('\n'));
    }

    if (Array.isArray(embeds) && embeds.length > 0) {
        for (const embed of embeds) {
            const e = embed.data || embed;
            if (e.title) parts.push(`**${e.title}**`);
            if (e.description) parts.push(e.description);
            for (const field of e.fields || []) {
                parts.push(`**${field.name}:** ${field.value}`);
            }
        }
    }

    return { content: parts.join('\n') || '✅ Done.' };
}

class MessageContext {
    constructor(message, args, command) {
        this.message = message;
        this._args = args;
        this._command = command;
        this._reply = null;

        this.guild = message.guild;
        this.guildId = message.guildId;
        this.channel = message.channel;
        this.channelId = message.channelId;
        this.member = message.member;
        this.user = message.author;
        this.client = message.client;
        this.replied = false;
        this.deferred = false;

        this.options = this._buildOptions(args, command);
    }

    _buildOptions(args, command) {
        const optionDefs = command.data.options || [];
        const parsed = {};
        let argIndex = 0;

        for (const opt of optionDefs) {
            const name = opt.name;
            const type = opt.type;
            const raw = args[argIndex];

            if (raw === undefined) {
                parsed[name] = null;
                continue;
            }

            if (type === 3) {
                parsed[name] = args.slice(argIndex).join(' ');
                argIndex = args.length;
            } else if (type === 4 || type === 10) {
                const n = Number(raw);
                parsed[name] = isNaN(n) ? null : n;
                argIndex++;
            } else if (type === 5) {
                parsed[name] = raw === 'true' || raw === 'yes' || raw === '1';
                argIndex++;
            } else {
                parsed[name] = raw;
                argIndex++;
            }
        }

        return {
            getString: (name) => parsed[name] ?? null,
            getInteger: (name) => parsed[name] ?? null,
            getNumber: (name) => parsed[name] ?? null,
            getBoolean: (name) => parsed[name] ?? null,
            getUser: (name) => null,
            getMember: (name) => null,
            getChannel: (name) => null,
            getRole: (name) => null,
            getFocused: () => args[0] ?? '',
        };
    }

    async deferReply(options) {
        this.deferred = true;
        this._reply = await this.message.reply({ content: '⏳ Loading...' });
    }

    async reply(payload) {
        this.replied = true;
        const resolved = resolveReplyPayload(payload);
        if (resolved.content && resolved.content.length > 2000) {
            resolved.content = resolved.content.slice(0, 1997) + '...';
        }
        this._reply = await this.message.reply(resolved);
        return this._reply;
    }

    async editReply(payload) {
        const resolved = resolveReplyPayload(payload);
        if (resolved.content && resolved.content.length > 2000) {
            resolved.content = resolved.content.slice(0, 1997) + '...';
        }
        if (this._reply) {
            await this._reply.edit(resolved);
        } else {
            this._reply = await this.message.reply(resolved);
        }
        return this._reply;
    }

    async followUp(payload) {
        const resolved = resolveReplyPayload(payload);
        return this.message.channel.send(resolved);
    }

    isChatInputCommand() { return true; }
    isAutocomplete() { return false; }
    isButton() { return false; }
    isStringSelectMenu() { return false; }
}

module.exports = MessageContext;
