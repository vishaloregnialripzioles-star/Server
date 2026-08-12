import type { Command } from '../types.js';
import { GAME_DEFS, game as baseGame } from './games.js';

const activeGames = new Set<string>();

function componentJson(component: any): any {
  return typeof component?.toJSON === 'function' ? component.toJSON() : component;
}

function sanitizeComponents(components: any): any {
  if (!Array.isArray(components)) return components;
  return components.map((row: any) => {
    const data = componentJson(row);
    if (!data?.components) return data;
    return {
      ...data,
      components: data.components.filter((c: any) => !String(c?.custom_id ?? c?.customId ?? '').endsWith(':start')),
    };
  });
}

function extractGameId(components: any): string | null {
  if (!Array.isArray(components)) return null;
  for (const row of components) {
    const data = componentJson(row);
    for (const c of data?.components ?? []) {
      const customId = String(c?.custom_id ?? c?.customId ?? '');
      if (customId.endsWith(':start')) return customId.slice(0, -6);
    }
  }
  return null;
}

function installThirtySecondLobby(interaction: any, gameName: string): () => void {
  const definition = GAME_DEFS.find(g => g.name === gameName);
  if (!definition) return () => undefined;

  const originalReply = interaction.reply.bind(interaction);
  const originalEditReply = interaction.editReply;
  let replyPatched = false;

  interaction.reply = async (options: any) => {
    if (replyPatched) return originalReply(options);
    replyPatched = true;

    const gameId = extractGameId(options?.components);
    const cleanedOptions = {
      ...options,
      components: sanitizeComponents(options?.components),
    };
    const message = await originalReply(cleanedOptions);

    const originalCreateCollector = message.createMessageComponentCollector.bind(message);
    const originalMessageEdit = message.edit.bind(message);
    const creatorId = interaction.user.id;
    const players = new Set<string>([creatorId]);

    const proxy = new Proxy(message, {
      get(target, property, receiver) {
        if (property === 'edit') {
          return async (payload: any) => originalMessageEdit({
            ...payload,
            components: sanitizeComponents(payload?.components),
          });
        }

        if (property === 'createMessageComponentCollector') {
          return (options: any = {}) => {
            const realCollector = originalCreateCollector({ ...options, time: 30_500 });
            let collectHandler: ((i: any) => any) | null = null;
            let timer: ReturnType<typeof setTimeout> | undefined;
            let finished = false;

            const wrappedCollector: any = {
              on(event: string, listener: any) {
                if (event === 'collect') {
                  collectHandler = async (i: any) => {
                    if (i?.customId === `${gameId}:join` && players.size < definition.max) {
                      players.add(i.user.id);
                    }
                    return listener(i);
                  };
                  realCollector.on(event, collectHandler);
                } else {
                  realCollector.on(event, listener);
                }
                return wrappedCollector;
              },
              once(event: string, listener: any) {
                realCollector.once(event, listener);
                return wrappedCollector;
              },
              stop(reason?: string) {
                finished = true;
                if (timer) clearTimeout(timer);
                return realCollector.stop(reason);
              },
            };

            timer = setTimeout(async () => {
              if (finished) return;
              if (players.size >= definition.min && collectHandler && gameId) {
                const autoStartInteraction = {
                  customId: `${gameId}:start`,
                  user: { id: creatorId },
                  deferUpdate: async () => undefined,
                  reply: async () => undefined,
                  update: async () => undefined,
                };
                try {
                  await collectHandler(autoStartInteraction);
                } catch (error) {
                  console.error(`[game:${gameName}:auto-start]`, error);
                  realCollector.stop('auto-start-error');
                }
              } else {
                realCollector.stop('lobby-timeout');
              }
            }, 30_000);

            return wrappedCollector;
          };
        }

        return Reflect.get(target, property, receiver);
      },
    });

    return proxy;
  };

  return () => {
    interaction.reply = originalReply;
    interaction.editReply = originalEditReply;
  };
}

export const gamePolicy: Command = {
  data: baseGame.data,
  async execute(interaction) {
    if (!interaction.guild) return;

    const gameName = interaction.options.getString('name', true);
    const definition = GAME_DEFS.find(g => g.name === gameName);
    if (!definition) return;

    const guildId = interaction.guild.id;
    if (activeGames.has(guildId)) {
      await interaction.reply({
        content: '🎮 A game is already running in this server. Please wait until it ends before starting another game.',
        ephemeral: true,
      });
      return;
    }

    activeGames.add(guildId);
    const restore = installThirtySecondLobby(interaction, gameName);
    try {
      await baseGame.execute(interaction);
    } catch (error) {
      console.error(`[game:${gameName}]`, error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ The game could not start.', ephemeral: true }).catch(() => undefined);
      }
    } finally {
      restore();
      activeGames.delete(guildId);
    }
  },
};
