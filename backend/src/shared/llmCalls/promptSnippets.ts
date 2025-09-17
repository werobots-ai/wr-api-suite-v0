import { SNIPPET_WORD } from "../config/questionTypes";

export const ANSWER_GENERATOR_INSTRUCTIONS = `General instructions:
- When referring to any data or information from the source, always mention the row numbers where it can be confirmed.
- Avoid fabricating examples; only reference actual ${SNIPPET_WORD} content.
- Ensure that both your detailed and short answers are naturally fitting responses to the actual question.
`;
