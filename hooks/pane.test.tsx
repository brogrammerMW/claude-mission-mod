import { test, expect, mock } from 'claude-code/testing'

// With no mission yet every card still draws: title bar, orchestrator, reviewer, workers, log.
test('the mission pane draws on terminal and desktop', async ($, on) => {
  // Stands in for the engine beneath; the mod draws the whole pane and never calls next.
  mock.clock(on)
  on('ui.render', ($, e) => { const { Text } = $.ui.resolve(e); return <Text>ENGINE-STUB</Text> })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'mission', surface, component: 'Pane', requestId: 'mission',
      props: { title: 'Mission', isFocused: false, bodyColumns: 64, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
      viewport: { columns: 64, rows: 40 },
    })
    expect(await ui.find({ type: 'Text', text: /ORCHESTRATOR/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /REVIEWER/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /workers · 0 running · 0 total/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /mission log/ })).toBeDefined()
    await ui.unmount()
  }
})

// A quarter-width dock: compact labels, nothing laid out past the body.
test('the mission pane fits a quarter-width dock', async ($, on) => {
  mock.clock(on)
  on('ui.render', ($, e) => { const { Text } = $.ui.resolve(e); return <Text>ENGINE-STUB</Text> })
  const ui = await $.ui.mount({
    plugin: 'mission', surface: 'terminal', component: 'Pane', requestId: 'mission',
    props: { title: 'Mission', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    viewport: { columns: 160, rows: 40 },
  })
  expect(await ui.find({ type: 'Text', text: /^ROUTING OFF$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: / orch {2}/ })).toBeDefined()
  await ui.unmount()
})
