import { Hono } from 'hono'
import { getLatestMods, getMods } from './mods-loader'

const app = new Hono()


app.get('/latest-game-version', c => {
  return c.json({
    lesta: '0.9.0',
    wargaming: '0.9.0',
  })
})


app.get('/mods', c => {
  return c.json(getMods())
})

app.get('/mods-latest', c => {
  return c.json(getLatestMods())
})

export default app