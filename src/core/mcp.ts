import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { config } from './config.js';
import { logger } from './logger.js';
import { registry } from './metrics.js';
import type { Sensor } from '../sensors/base/sensor.js';
import type { AppService } from '../services/app.service.js';
import type { IdeService } from '../services/ide.service.js';
import type { InterventionService } from './intervention.service.js';

// ---- MCP Server factory ----------------------------------------------------

export function createMcpServer(deps: {
  sensors: Sensor[];
  appService: AppService;
  ideService: IdeService;
  interventionService: InterventionService;
  startedAt: number;
}): FastMCP {
  const server = new FastMCP({
    name: 'flow-agent-telemetry',
    version: '2.0.0',
  });

  // ---- Tool: health --------------------------------------------------------
  server.addTool({
    name: 'health',
    description: 'Returns health status of the daemon and all sensors',
    parameters: z.object({}),
    execute: async () => {
      const uptimeSec = Math.round((Date.now() - deps.startedAt) / 1000);
      const sensorHealth = deps.sensors.map((s) => s.health());
      const allOk = sensorHealth.every((h) => h.status!== 'error');

      return JSON.stringify({
        status: allOk? 'ok' : 'degraded',
        uptime_sec: uptimeSec,
        intervention_clients: deps.interventionService.clientCount,
        sensors: sensorHealth,
      });
    },
  });

  // ---- Tool: metrics -------------------------------------------------------
  server.addTool({
    name: 'metrics',
    description: 'Returns Prometheus-format metrics for all sensors and DB',
    parameters: z.object({}),
    execute: async () => {
      return await registry.metrics();
    },
  });

  // ---- Tool: get_app_summary -----------------------------------------------
  server.addTool({
    name: 'get_app_summary',
    description: 'Returns per-app usage summary for the given time window',
    parameters: z.object({
      window_minutes: z
       .number()
       .int()
       .positive()
       .max(1440)
       .default(60)
       .describe('Look-back window in minutes (max 1440 = 24 h)'),
    }),
    execute: async ({ window_minutes }) => {
      const summary = await deps.appService.getSummary(window_minutes * 60 * 1000);
      return JSON.stringify(summary);
    },
  });

  // ---- Tool: get_ide_summary -----------------------------------------------
  server.addTool({
    name: 'get_ide_summary',
    description: 'Returns per-project IDE session summary for the given time window',
    parameters: z.object({
      window_minutes: z
       .number()
       .int()
       .positive()
       .max(1440)
       .default(60)
       .describe('Look-back window in minutes (max 1440 = 24 h)'),
    }),
    execute: async ({ window_minutes }) => {
      const now = Date.now(); // <- Fix: calculate fromMs and toMs
      const fromMs = now - window_minutes * 60 * 1000;
      const summary = await deps.ideService.getSummary(fromMs, now);
      return JSON.stringify(summary);
    },
  });

  return server;
}

export async function startMcpServer(server: FastMCP): Promise<void> {
  const port = config.get().MCP_PORT;
  // FastMCP SSE transport — host binding depends on version.
  // If fastmcp exposes a host option, prefer 127.0.0.1.
  await server.start({
    transportType: 'sse',
    sse: {
      port,
      // host: '127.0.0.1', // uncomment if supported by installed version
    },
  } as Parameters<FastMCP['start']>[0]);

  logger.info({ port }, 'MCP server started (SSE)');
}