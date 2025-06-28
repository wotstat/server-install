import { Hono } from 'hono'
import Api from './api'
import { loadTask } from './mods-loader'
import { schedule } from "node-cron";

const app = new Hono()
app.route('/api', Api)

// loadTask()
schedule('* 8,20 * * *', async () => {
  await loadTask()
});

export default app