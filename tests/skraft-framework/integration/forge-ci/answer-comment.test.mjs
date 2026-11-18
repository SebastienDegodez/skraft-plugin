import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickAnswerFrom } from '../../../../plugins/skraft-framework/engine/drivers/forge-ci/answer-comment.mjs'

const BOT = 'skraft-bot'
const URL = 'https://x/issue#issuecomment-'

const comment = (login, body, id) => ({ login, body, url: `${URL}${id}` })

test('the latest comment whose first non-blank line is `/skraft-answer <key> <ANSWER>` from someone else than the bot is picked, with the reason line that follows when there is one', () => {
  const comments = [
    comment(BOT, '<sub>skraft-ask key=adr-1 run=checkout step=adr</sub>\n\nRatify?\n\nReply with:\n/skraft-answer adr-1 <OPTION>', 901),
    comment('alice', '/skraft-answer adr-1 RATIFIED', 902),
    comment('bob', '/skraft-answer adr-1 REJECTED\nreason: too costly', 903),
  ]

  assert.deepEqual(pickAnswerFrom(comments, BOT), { key: 'adr-1', answer: 'REJECTED', reason: 'too costly', url: `${URL}903` })
})

test('a comment is ignored when its first non-blank line is not the slash command, or when it is the bot\'s own', () => {
  assert.equal(pickAnswerFrom([comment('alice', 'thanks, I pick RATIFIED', 1)], BOT), null)
  assert.equal(pickAnswerFrom([comment(BOT, '/skraft-answer adr-1 RATIFIED', 1)], BOT), null)
  assert.equal(pickAnswerFrom([], BOT), null)
})

test('an older `/skraft-answer` is picked only when every later comment is the bot\'s or has no slash line', () => {
  const comments = [
    comment('alice', '/skraft-answer adr-1 RATIFIED', 1),
    comment(BOT, '<sub>skraft-ask key=adr-1 ...</sub>\nnew question text', 2),
    comment('alice', 'I will reply later', 3),
  ]

  assert.deepEqual(pickAnswerFrom(comments, BOT), { key: 'adr-1', answer: 'RATIFIED', reason: null, url: `${URL}1` })
})
