import { normalizeEdgeRenderPath, storeEdgePage } from '../utils/edge-cache-handler'

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('render:before', ({ event }) => normalizeEdgeRenderPath(event))
  nitro.hooks.hook('beforeResponse', (event, response) => storeEdgePage(event, response.body))
})
