/** Strict expert policy used by the real team runtime and cold-resume fixture. */
export const inject = ['agents', 'agentPresets', 'skills', 'tools', 'typert'];

export async function apply(ctx) {
    const source = process.env.LAB_TOOLBOX_AUTHORIZATION;
    if (!source) throw new Error('Toolbox authorization fixture source is missing');
    const { ToolboxAuthorization } = await import(source);
    new ToolboxAuthorization(ctx, {
        namespace: 'role-tool-fixture',
        policies: () => ({
            'fixture-expert-v1': {
                enabled: true, nativeTools: [], skillNames: [], mcpServers: [], cliToolIds: [],
            },
        }),
        cliToolName: () => undefined,
    });
}
