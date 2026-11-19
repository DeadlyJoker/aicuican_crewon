/** Shared message-body factory used by native and feature-owned replies. */
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'

/** @param props - Text, stable identity and the shared renderer chain. @returns Interactive body or ordinary Markdown. */
export function MessageBody(props: FactoryComponentPropsOf<'conversation.message.body'>) {
  const { renderSlotChain, text, identity, labels, streaming, fileMentions, pathImages, textInteractionSource = false,
    interrupted, recipient } = props
  return renderSlotChain('conversation.chat.message.body', { text, identity, labels, streaming, fileMentions,
    pathImages, textInteractionSource, interrupted, recipient }, {
    fallback: <MarkdownText text={text} labels={labels} streaming={streaming} fileMentions={fileMentions} pathImages=
      {pathImages} textInteractionSource={textInteractionSource} />,
  })
}
