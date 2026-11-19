/** Extract document paragraphs locally; embedded images and document markup are not rendered. */
import mammoth from 'mammoth/mammoth.browser.js';
export async function extractDocx(arrayBuffer){return (await mammoth.extractRawText({arrayBuffer})).value;}
