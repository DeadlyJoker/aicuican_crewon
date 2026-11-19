/** The imported library reads legacy OLE Word buffers without launching Office. */
declare module 'word-extractor' {
  export default class WordExtractor {
    extract(input: Buffer): Promise<{ getBody(): string }>
  }
}
