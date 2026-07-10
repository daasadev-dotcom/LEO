/**
 * MessageContext — bridges a Discord Message to the Interaction interface
 * used by slash command execute functions, so prefix commands can reuse
 * the same handlers without duplicating logic.
 *
 * Components V2 (ContainerBuilder etc.) are sent directly in channel messages
 * using MessageFlags.IsComponentsV2, which Discord supports in regular messages.
 * IsPersistent is stripped (interaction-only). Ephemeral replies fall back to
 * normal channel replies since prefix commands have no token for ephemerals.
 */

const { MessageFlags } = require('discord.js');

// Strip IsPersistent (interaction-only) but keep IsComponentsV2
const CV2 = MessageFlags.IsComponentsV2;

function resolveReplyPayload(payload) {
    if (!payload) return { content: '✅ Done.' };
    if (typeof payload === 'string') return { content: payload };

    const { content, components, embeds, files } = payload;

    // Components V2 — pass through directly; Discord supports this in channel messages
    if (Array.isArray(components) && components.length > 0) {
        const result = { components, flags: CV2 };
        if (files) result.files = files;
        return result;
    }

    // Embeds / plain text fallback
    const parts = [];
    if (content) parts.push(content);
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
    const result = { content: parts.join('\n') || '✅ Done.' };
    if (files) result.files = files;
    return result;
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
                // STRING — consume remaining args
                parsed[name] = args.slice(argIndex).join(' ');
                argIndex = args.length;
            } else if (type === 4 || type === 10) {
                // INTEGER / NUMBER
                const n = Number(raw);
                parsed[name] = isNaN(n) ? null : n;
                argIndex++;
            } else if (type === 5) {
                // BOOLEAN
                parsed[name] = raw === 'true' || raw === 'yes' || raw === '1';
                argIndex++;
            } else {
                parsed[name] = raw;
                argIndex++;
            }
        }

        return {
            getString:  (name) => (parsed[name] !== undefined ? parsed[name] : null),
            getInteger: (name) => (parsed[name] !== undefined ? parsed[name] : null),
            getNumber:  (name) => (parsed[name] !== undefined ? parsed[name] : null),
            getBoolean: (name) => (parsed[name] !== undefined ? parsed[name] : null),
            getUser:    ()     => null,
            getMember:  ()     => null,
            getChannel: ()     => null,
            getRole:    ()     => null,
            getFocused: ()     => args[0] ?? '',
        };
    }

    // ── Interaction-compatible API ──────────────────────────────────────────────

    async deferReply(options) {
        this.deferred = true;
        // Send a placeholder so editReply has something to edit
        this._reply = await this.message.channel.send({ content: '⏳ Loading...' });
        return this._reply;
    }

    async reply(payload) {
        if (this.replied) return this._reply;
        this.replied = true;
        const resolved = resolveReplyPayload(payload);
        this._reply = await this.message.reply(resolved);
        return this._reply;
    }

    async editReply(payload) {
        const resolved = resolveReplyPayload(payload);
        if (this._reply) {
            this._reply = await this._reply.edit(resolved);
        } else {
            this._reply = await this.message.reply(resolved);
            this.replied = true;
        }
        return this._reply;
    }

    async followUp(payload) {
        const resolved = resolveReplyPayload(payload);
        return this.message.channel.send(resolved);
    }

    // ── Type guards (used by some command guards) ───────────────────────────────

    isChatInputCommand() { return true; }
    isAutocomplete()     { return false; }
    isButton()           { return false; }
    isStringSelectMenu() { return false; }
}

module.exports = MessageContext;
