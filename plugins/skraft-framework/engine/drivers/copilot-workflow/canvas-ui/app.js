// The skraft-pipeline canvas page: draws the content its loopback server streams. It decides
// nothing: every text comes from the server and is set with textContent, never as HTML.
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

const drawQuestion = (question) => {
  byId('question').hidden = question === null
  byId('question-header').textContent = question?.header ?? ''
  byId('question-text').textContent = question === null ? '' : `${question.text} (${question.key})`
  byId('question-choices').replaceChildren()
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
