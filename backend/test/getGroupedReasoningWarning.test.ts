import test from 'node:test';
import assert from 'node:assert/strict';

import { getGroupedReasoningWarning } from '../src/utils/getGroupedReasoningWarning';
import { Question } from '../src/types/Questions';

const makeQuestion = (id: number, text: string): Question => ({
  questionId: id,
  questionText: text,
  shortQuestionText: text,
  description: '',
  questionType: 'classification',
  group: '',
  dependencies: [],
  choices: [],
});

test('returns empty string when no other questions', () => {
  const q = makeQuestion(1, 'First question');
  const warning = getGroupedReasoningWarning([q], q);
  assert.equal(warning, '');
});

test('returns warning when other questions exist', () => {
  const q1 = makeQuestion(1, 'First question');
  const q2 = makeQuestion(2, 'Second question');
  const warning = getGroupedReasoningWarning([q1, q2], q1);
  assert.ok(warning.includes('Note:'));
  assert.ok(warning.includes('Q1:'));
  assert.ok(warning.includes('Q2:'));
  assert.ok(
    warning.includes(
      'Please ensure that that you only use the reasoning that is relevant to this question'
    )
  );
});

