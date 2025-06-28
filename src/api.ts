import { Hono } from 'hono'

const app = new Hono()


app.get('/latest-game-version', c => {
  return c.json({
    lesta: '0.9.0',
    wargaming: '0.9.0',
  })
})

app.get('/mods', c => {
  return c.json({

  })
})

export default app