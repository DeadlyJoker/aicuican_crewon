/* Test fixture adapted from NanmiCoder/dsh-agent-teams 0.1.28.
MIT License

Copyright (c) 2026 程序员阿江(Relakkes)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
/** Test-only driver mounted by the real published CLI after a cold restart. */
import { createUserMessage } from '@deepseek-ai/dsh-llm';
export const name = 'runtime-lab-cold-resume';
export const inject = ['agents', 'sessions'];
export function apply(ctx) {
    void (async () => {
        await ctx.get('loader').await();
        const handle = await ctx.agents.resume({ resumeSessionId: process.env.LAB_PARENT_SESSION, agentOptions: { provider: 'runtime-lab', model: 'fixture-model' } });
        ctx.effect(() => () => handle.dispose());
        await handle.agent.whenIdle();
        handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'COLD_RESTORE_FIXTURE' }], source: { kind: 'user' } }));
        await handle.agent.whenIdle();
        for (const agent of ctx.agents.list()) {
            await agent.whenIdle();
            // Best effort: a handle may close while this loop awaits an earlier
            // agent. Closing persists, so a closed handle needs no flush — and
            // the host rejects flushing one.
            try { if (ctx.sessions.get(agent.id) === agent.session) await ctx.sessions.flush(agent.session); }
            catch (error) { if (String(error?.name) !== 'SessionHandleClosedError') throw error; }
        }
        process.stdout.write('COLD_RESTORE_DRIVER_DONE\n');
        ctx.get('appExit')(0);
    })().catch(error => { process.stderr.write(String(error) + '\n'); ctx.get('appExit')(1); });
}
