import { Hono } from 'hono'
import Api from './api'
import { loadTask } from './mods-loader'
import { schedule } from "node-cron";
import { cors } from 'hono/cors';

const app = new Hono()
app.use(cors())
app.route('/api', Api)

try { loadTask() }
catch (error) { console.error(error) }
schedule('* 8,20 * * *', async () => {
  try { await loadTask() }
  catch (error) { console.error(error) }
});

export default app