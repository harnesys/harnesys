import { type AddonContext, defineAddon } from '@harnesys/sdk';

export const addon = defineAddon({
  register({ tools, configs, contents, views, hooks, routes }) {
    configs.register({
      id: 'starter.config',
      config: {
        fields: [
          {
            key: 'greeting',
            label: 'Greeting',
            type: 'string',
            description: 'What the tool says before the name.',
            default: 'hi',
          },
          {
            key: 'shout',
            label: 'Shout',
            type: 'boolean',
            description: 'Reply in uppercase.',
            default: false,
          },
          {
            key: 'maxLength',
            label: 'Max length',
            type: 'number',
            description: 'Trim the reply to this many characters.',
            default: 32,
          },
          {
            key: 'lang',
            label: 'Language',
            type: 'select',
            default: 'en',
            options: [
              { label: 'English', value: 'en' },
              { label: 'Russian', value: 'ru' },
            ],
          },
        ],
      },
    });

    tools.register({
      id: 'starter.hello',
      tool: {
        name: 'hello_addon',
        description: 'Greet someone by name.',
        input: { name: 'string' },
      },
      async handle(input, ctx: AddonContext) {
        const config = ctx.config.read();
        const name = typeof input.name === 'string' ? input.name : 'anon';
        const greeting = typeof config.greeting === 'string' ? config.greeting : 'hi';
        const shout = config.shout === true;
        const maxLength = typeof config.maxLength === 'number' ? config.maxLength : 32;
        const lang = config.lang === 'ru' ? 'ru' : 'en';
        ctx.logger.info('tool called', { name, greeting, lang });
        const message = lang === 'ru' ? `привет ${name}` : `${greeting} ${name}`;
        const reply = shout ? message.toUpperCase() : message;
        return { ok: true, text: reply.slice(0, maxLength) };
      },
    });

    contents.register({ id: 'starter.skills', content: { dir: './contents/skills' } });
    contents.register({ id: 'starter.prompt', content: { dir: './contents/prompts' } });

    views.register({
      id: 'starter.section',
      view: {
        container: 'sidebar',
        kind: 'section',
        label: 'Starter',
        icon: 'puzzle',
      },
    });

    hooks.register({
      id: 'starter.strip',
      hook: { on: 'PreModelCall', effect: 'update_input', order: 100 },
      async apply(payload) {
        return payload;
      },
    });

    routes.register({
      id: 'starter.status',
      route: { method: 'GET', path: '/status' },
      async handler(_request, ctx) {
        return { status: 200, body: { addon: ctx.addonId, version: ctx.version } };
      },
    });
  },
});
