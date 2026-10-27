// The skraft-pipeline canvas page: draws the content its loopback server streams, and sends the
// answer a person picks with a button. It decides nothing: every text comes from the server and
// is set with textContent, never as HTML; Copilot asks the person to confirm an answer before
// skraft records it.
const token = document.querySelector('meta[name="skraft-panel-token"]')?.getAttribute('content') ?? ''
const byId = (id) => document.getElementById(id)

/** An element with its text and its state, for the stylesheet. */
const line = (tag, { key, text, state }) => {
  const node = document.createElement(tag)
  node.textContent = text
  node.dataset.key = key
  node.dataset.state = state
  return node
}

const drawPhases = (phases) => byId('phases').replaceChildren(...phases.map((phase) => {
  const item = line('li', phase)
  const steps = document.createElement('ol')
  steps.replaceChildren(...phase.steps.map((step) => line('li', step)))
  item.append(steps)
  return item
}))

const UNREACHABLE = 'The answer did not reach skraft; answer with skraft decide in a terminal.'

/** Each choice disabled while an answer is on its way. */
const busy = (on) => { for (const button of byId('question-choices').querySelectorAll('button')) button.disabled = on }

/** Sends one answer; the reason goes with a choice that needs one. Says what it came to. */
const send = async (key, choice) => {
  const reason = byId('question-reason')?.value.trim() ?? ''
  const body = { key, answer: choice.answer, ...(choice.needsReason && reason !== '' ? { reason } : {}) }
  busy(true)
  try {
    const response = await fetch('/answer', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Skraft-Token': token }, body: JSON.stringify(body) })
    const result = await response.json()
    byId('answer-note').textContent = result.text ?? result.error ?? UNREACHABLE
  } catch {
    byId('answer-note').textContent = UNREACHABLE
  } finally {
    busy(false)
  }
}

const choiceButton = (key, choice) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = choice.answer
  button.addEventListener('click', () => { void send(key, choice) })
  return button
}

const reasonInput = () => {
  const input = document.createElement('input')
  input.id = 'question-reason'
  input.placeholder = 'Your reason (needed to refuse)'
  input.setAttribute('aria-label', 'Your reason, needed to refuse')
  return input
}

let shownKey = null

/**
 * The question and its choices, drawn again only for another question, so that a reason being
 * typed stays; what the last answer came to stays shown once the question is gone.
 */
const drawQuestion = (question) => {
  byId('question').hidden = question === null
  byId('question-header').textContent = question?.header ?? ''
  byId('question-text').textContent = question === null ? '' : `${question.text} (${question.key})`
  if ((question?.key ?? null) === shownKey) return
  shownKey = question?.key ?? null
  if (question !== null) byId('answer-note').textContent = ''
  const choices = question === null ? [] : question.choices.map((choice) => choiceButton(question.key, choice))
  const reason = question !== null && question.choices.some((choice) => choice.needsReason) ? [reasonInput()] : []
  byId('question-choices').replaceChildren(...choices, ...reason)
}

const draw = (content) => {
  byId('title').textContent = content.title
  document.title = content.title
  byId('status').textContent = content.status
  byId('status').dataset.status = content.status
  byId('reason').textContent = content.reason
  drawPhases(content.phases)
  byId('details').replaceChildren(...content.details.map((detail) => line('li', detail)))
  drawQuestion(content.question)
}

const events = new EventSource(`/events?token=${encodeURIComponent(token)}`)
events.onmessage = (message) => {
  byId('offline').hidden = true
  draw(JSON.parse(message.data))
}
events.onerror = () => { byId('offline').hidden = false }
