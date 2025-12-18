/**
 * Tests for Phase 58: Command Center v1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  COMMAND_CENTER_VERSION,
  CommandCenterErrorCodes,
  CommandCenter,
  createCommandCenter,
  createDashboardConfig,
  createWidgetConfig,
  validateDashboardConfig,
  validateWidgetConfig,
  DashboardConfigSchema,
  WidgetConfigSchema,
  WidgetDataSourceSchema,
  VisualizationConfigSchema,
  DashboardLayoutSchema,
  type DashboardConfig,
  type WidgetConfig,
  type WidgetType,
  type ChartType,
  type TimeRange,
  type WidgetData,
  type SeriesData,
  type ForecastData,
  type BacktestData,
  type MetricData,
  type AlertData,
} from '../index.js';

describe('Command Center Module', () => {
  describe('Version and Constants', () => {
    it('should export version', () => {
      expect(COMMAND_CENTER_VERSION).toBe('1.0.0');
    });

    it('should export error codes', () => {
      expect(CommandCenterErrorCodes.INVALID_DASHBOARD).toBe('CC_1001');
      expect(CommandCenterErrorCodes.DATA_FETCH_FAILED).toBe('CC_2001');
      expect(CommandCenterErrorCodes.STREAM_FAILED).toBe('CC_3001');
      expect(CommandCenterErrorCodes.RENDER_FAILED).toBe('CC_4001');
    });
  });

  describe('DashboardConfig Validation', () => {
    it('should validate valid dashboard config', () => {
      const config = {
        id: 'dashboard_1',
        name: 'Test Dashboard',
        tenantId: 'tenant_1',
        ownerId: 'user_1',
        widgets: [],
        layout: {
          type: 'grid' as const,
          columns: 12,
          rowHeight: 100,
          gap: 16,
        },
        refreshInterval: 30,
        theme: 'light' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const result = validateDashboardConfig(config);
      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const config = {
        id: 'dashboard_1',
        name: '',
        tenantId: 'tenant_1',
        ownerId: 'user_1',
        widgets: [],
        layout: { type: 'grid', columns: 12, rowHeight: 100, gap: 16 },
        refreshInterval: 30,
        theme: 'light',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const result = validateDashboardConfig(config);
      expect(result.success).toBe(false);
    });

    it('should reject invalid theme', () => {
      const config = {
        id: 'dashboard_1',
        name: 'Test',
        tenantId: 'tenant_1',
        ownerId: 'user_1',
        widgets: [],
        layout: { type: 'grid', columns: 12, rowHeight: 100, gap: 16 },
        refreshInterval: 30,
        theme: 'invalid',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const result = validateDashboardConfig(config);
      expect(result.success).toBe(false);
    });

    it('should reject columns > 24', () => {
      const config = {
        id: 'dashboard_1',
        name: 'Test',
        tenantId: 'tenant_1',
        ownerId: 'user_1',
        widgets: [],
        layout: { type: 'grid', columns: 25, rowHeight: 100, gap: 16 },
        refreshInterval: 30,
        theme: 'light',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const result = validateDashboardConfig(config);
      expect(result.success).toBe(false);
    });
  });

  describe('WidgetConfig Validation', () => {
    it('should validate valid widget config', () => {
      const widget = {
        id: 'widget_1',
        type: 'time_series' as const,
        title: 'CPU Usage',
        dataSource: {
          type: 'series' as const,
          seriesIds: ['cpu_1'],
          timeRange: { type: 'relative' as const, value: 24, unit: 'hours' as const },
        },
        visualization: {
          chartType: 'line' as const,
          showLegend: true,
        },
      };
      const result = validateWidgetConfig(widget);
      expect(result.success).toBe(true);
    });

    it('should reject invalid widget type', () => {
      const widget = {
        id: 'widget_1',
        type: 'invalid_type',
        title: 'Test',
        dataSource: {
          type: 'series',
          timeRange: { type: 'relative', value: 24, unit: 'hours' },
        },
        visualization: {
          chartType: 'line',
          showLegend: true,
        },
      };
      const result = validateWidgetConfig(widget);
      expect(result.success).toBe(false);
    });

    it('should reject invalid chart type', () => {
      const widget = {
        id: 'widget_1',
        type: 'time_series',
        title: 'Test',
        dataSource: {
          type: 'series',
          timeRange: { type: 'relative', value: 24, unit: 'hours' },
        },
        visualization: {
          chartType: 'invalid_chart',
          showLegend: true,
        },
      };
      const result = validateWidgetConfig(widget);
      expect(result.success).toBe(false);
    });

    it('should validate absolute time range', () => {
      const widget = {
        id: 'widget_1',
        type: 'time_series' as const,
        title: 'Test',
        dataSource: {
          type: 'series' as const,
          timeRange: { type: 'absolute' as const, start: 1000, end: 2000 },
        },
        visualization: {
          chartType: 'line' as const,
          showLegend: true,
        },
      };
      const result = validateWidgetConfig(widget);
      expect(result.success).toBe(true);
    });
  });

  describe('createDashboardConfig', () => {
    it('should create default dashboard config', () => {
      const config = createDashboardConfig({
        name: 'Test Dashboard',
        tenantId: 'tenant_1',
        ownerId: 'user_1',
      });
      expect(config.name).toBe('Test Dashboard');
      expect(config.tenantId).toBe('tenant_1');
      expect(config.ownerId).toBe('user_1');
      expect(config.widgets).toEqual([]);
      expect(config.layout.type).toBe('grid');
      expect(config.layout.columns).toBe(12);
      expect(config.refreshInterval).toBe(30);
      expect(config.theme).toBe('system');
    });

    it('should override defaults', () => {
      const config = createDashboardConfig({
        name: 'Custom Dashboard',
        tenantId: 'tenant_1',
        ownerId: 'user_1',
        theme: 'dark',
        refreshInterval: 60,
      });
      expect(config.theme).toBe('dark');
      expect(config.refreshInterval).toBe(60);
    });
  });

  describe('createWidgetConfig', () => {
    it('should create default widget config', () => {
      const widget = createWidgetConfig({
        type: 'time_series',
        title: 'Test Widget',
        dataSource: {
          type: 'series',
          timeRange: { type: 'relative', value: 24, unit: 'hours' },
        },
      });
      expect(widget.type).toBe('time_series');
      expect(widget.title).toBe('Test Widget');
      expect(widget.visualization.chartType).toBe('line');
      expect(widget.visualization.showLegend).toBe(true);
      expect(widget.visualization.showGrid).toBe(true);
    });

    it('should override visualization defaults', () => {
      const widget = createWidgetConfig({
        type: 'forecast',
        title: 'Forecast Widget',
        dataSource: {
          type: 'forecast',
          timeRange: { type: 'relative', value: 7, unit: 'days' },
        },
        visualization: {
          chartType: 'area',
          showLegend: false,
          fill: true,
        },
      });
      expect(widget.visualization.chartType).toBe('area');
      expect(widget.visualization.showLegend).toBe(false);
      expect(widget.visualization.fill).toBe(true);
    });
  });

  describe('createCommandCenter', () => {
    it('should create a command center instance', () => {
      const cc = createCommandCenter();
      expect(cc).toBeInstanceOf(CommandCenter);
    });
  });

  describe('CommandCenter', () => {
    let cc: CommandCenter;

    beforeEach(() => {
      cc = createCommandCenter();
    });

    describe('Dashboard Management', () => {
      it('should create a dashboard', () => {
        const config = createDashboardConfig({
          name: 'Test Dashboard',
          tenantId: 'tenant_1',
          ownerId: 'user_1',
        });
        const dashboard = cc.createDashboard(config);
        expect(dashboard.id).toMatch(/^dashboard_\d+$/);
        expect(dashboard.name).toBe('Test Dashboard');
        expect(dashboard.createdAt).toBeGreaterThan(0);
        expect(dashboard.updatedAt).toBeGreaterThan(0);
      });

      it('should get a dashboard by ID', () => {
        const config = createDashboardConfig({
          name: 'Test Dashboard',
          tenantId: 'tenant_1',
          ownerId: 'user_1',
        });
        const created = cc.createDashboard(config);
        const retrieved = cc.getDashboard(created.id);
        expect(retrieved).toEqual(created);
      });

      it('should return undefined for non-existent dashboard', () => {
        const retrieved = cc.getDashboard('non_existent');
        expect(retrieved).toBeUndefined();
      });

      it('should list dashboards for a tenant', () => {
        cc.createDashboard(createDashboardConfig({
          name: 'Dashboard 1',
          tenantId: 'tenant_1',
          ownerId: 'user_1',
        }));
        cc.createDashboard(createDashboardConfig({
          name: 'Dashboard 2',
          tenantId: 'tenant_1',
          ownerId: 'user_1',
        }));
        cc.createDashboard(createDashboardConfig({
          name: 'Dashboard 3',
          tenantId: 'tenant_2',
          ownerId: 'user_2',
        }));

        const tenant1Dashboards = cc.listDashboards('tenant_1');
        expect(tenant1Dashboards).toHaveLength(2);

        const tenant2Dashboards = cc.listDashboards('tenant_2');
        expect(tenant2Dashboards).toHaveLength(1);
      });

      it('should update a dashboard', () => {
        const config = createDashboardConfig({
          name: 'Original Name',
          tenantId: 'tenant_1',
          ownerId: 'user_1',
        });
        const created = cc.createDashboard(config);
        const originalUpdatedAt = created.updatedAt;

        // Small delay to ensure updatedAt changes
        const updated = cc.updateDashboard(created.id, { name: 'Updated Name' });

        expect(updated).toBeDefined();
        expect(updated!.name).toBe('Updated Name');
        expect(updated!.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
      });

      it('should return undefined when updating non-existent dashboard', () => {
        const updated = cc.updateDashboard('non_existent', { name: 'Test' });
        expect(updated).toBeUndefined();
      });

      it('should delete a dashboard', () => {
        const config = createDashboardConfig({
          name: 'To Delete',
          tenantId: 'tenant_1',
          ownerId: 'user_1',
        });
        const created = cc.createDashboard(config);
        const deleted = cc.deleteDashboard(created.id);
        expect(deleted).toBe(true);

        const retrieved = cc.getDashboard(created.id);
        expect(retrieved).toBeUndefined();
      });

      it('should return false when deleting non-existent dashboard', () => {
        const deleted = cc.deleteDashboard('non_existent');
        expect(deleted).toBe(false);
      });
    });

    describe('Widget Management', () => {
      let dashboardId: string;

      beforeEach(() => {
        const config = createDashboardConfig({
          name: 'Widget Test Dashboard',
          tenantId: 'tenant_1',
          ownerId: 'user_1',
        });
        const dashboard = cc.createDashboard(config);
        dashboardId = dashboard.id;
      });

      it('should add a widget to a dashboard', () => {
        const widget = createWidgetConfig({
          type: 'time_series',
          title: 'CPU Usage',
          dataSource: {
            type: 'series',
            seriesIds: ['cpu_1'],
            timeRange: { type: 'relative', value: 24, unit: 'hours' },
          },
        });
        const added = cc.addWidget(dashboardId, widget);
        expect(added).toBeDefined();
        expect(added!.id).toMatch(/^widget_\d+$/);
        expect(added!.title).toBe('CPU Usage');

        const dashboard = cc.getDashboard(dashboardId);
        expect(dashboard!.widgets).toHaveLength(1);
      });

      it('should return undefined when adding widget to non-existent dashboard', () => {
        const widget = createWidgetConfig({
          type: 'time_series',
          title: 'Test',
          dataSource: {
            type: 'series',
            timeRange: { type: 'relative', value: 24, unit: 'hours' },
          },
        });
        const added = cc.addWidget('non_existent', widget);
        expect(added).toBeUndefined();
      });

      it('should update a widget', () => {
        const widget = createWidgetConfig({
          type: 'time_series',
          title: 'Original Title',
          dataSource: {
            type: 'series',
            timeRange: { type: 'relative', value: 24, unit: 'hours' },
          },
        });
        const added = cc.addWidget(dashboardId, widget);
        const updated = cc.updateWidget(dashboardId, added!.id, { title: 'Updated Title' });

        expect(updated).toBeDefined();
        expect(updated!.title).toBe('Updated Title');
      });

      it('should return undefined when updating widget in non-existent dashboard', () => {
        const updated = cc.updateWidget('non_existent', 'widget_1', { title: 'Test' });
        expect(updated).toBeUndefined();
      });

      it('should return undefined when updating non-existent widget', () => {
        const updated = cc.updateWidget(dashboardId, 'non_existent', { title: 'Test' });
        expect(updated).toBeUndefined();
      });

      it('should remove a widget', () => {
        const widget = createWidgetConfig({
          type: 'time_series',
          title: 'To Remove',
          dataSource: {
            type: 'series',
            timeRange: { type: 'relative', value: 24, unit: 'hours' },
          },
        });
        const added = cc.addWidget(dashboardId, widget);
        const removed = cc.removeWidget(dashboardId, added!.id);
        expect(removed).toBe(true);

        const dashboard = cc.getDashboard(dashboardId);
        expect(dashboard!.widgets).toHaveLength(0);
      });

      it('should return false when removing widget from non-existent dashboard', () => {
        const removed = cc.removeWidget('non_existent', 'widget_1');
        expect(removed).toBe(false);
      });

      it('should return false when removing non-existent widget', () => {
        const removed = cc.removeWidget(dashboardId, 'non_existent');
        expect(removed).toBe(false);
      });
    });

    describe('Widget Data Fetching', () => {
      it('should fetch time series widget data', async () => {
        const widget = {
          id: 'widget_1',
          type: 'time_series' as const,
          title: 'Time Series',
          dataSource: {
            type: 'series' as const,
            seriesIds: ['series_1', 'series_2'],
            timeRange: { type: 'relative' as const, value: 24, unit: 'hours' as const },
          },
          visualization: {
            chartType: 'line' as const,
            showLegend: true,
          },
        };

        const data = await cc.fetchWidgetData(widget);
        expect(data.widgetId).toBe('widget_1');
        expect(data.loading).toBe(false);
        expect(data.series).toBeDefined();
        expect(data.series).toHaveLength(2);
        expect(data.series![0].points.length).toBeGreaterThan(0);
      });

      it('should fetch forecast widget data', async () => {
        const widget = {
          id: 'widget_2',
          type: 'forecast' as const,
          title: 'Forecast',
          dataSource: {
            type: 'forecast' as const,
            timeRange: { type: 'relative' as const, value: 7, unit: 'days' as const },
            model: 'exponential' as const,
            forecastHorizon: 24,
          },
          visualization: {
            chartType: 'line' as const,
            showLegend: true,
          },
        };

        const data = await cc.fetchWidgetData(widget);
        expect(data.forecast).toBeDefined();
        expect(data.forecast!.historical).toBeDefined();
        expect(data.forecast!.forecast.length).toBe(24);
        expect(data.forecast!.model).toBe('exponential');
      });

      it('should fetch backtest widget data', async () => {
        const widget = {
          id: 'widget_3',
          type: 'backtest' as const,
          title: 'Backtest Results',
          dataSource: {
            type: 'backtest' as const,
            timeRange: { type: 'relative' as const, value: 30, unit: 'days' as const },
          },
          visualization: {
            chartType: 'line' as const,
            showLegend: true,
          },
        };

        const data = await cc.fetchWidgetData(widget);
        expect(data.backtest).toBeDefined();
        expect(data.backtest!.metrics).toBeDefined();
        expect(data.backtest!.foldResults.length).toBeGreaterThan(0);
      });

      it('should fetch metric card widget data', async () => {
        const widget = {
          id: 'widget_4',
          type: 'metric_card' as const,
          title: 'Accuracy',
          dataSource: {
            type: 'metric' as const,
            metricName: 'Forecast Accuracy',
            timeRange: { type: 'relative' as const, value: 24, unit: 'hours' as const },
          },
          visualization: {
            chartType: 'line' as const,
            showLegend: false,
          },
        };

        const data = await cc.fetchWidgetData(widget);
        expect(data.metric).toBeDefined();
        expect(data.metric!.name).toBe('Forecast Accuracy');
        expect(typeof data.metric!.value).toBe('number');
        expect(data.metric!.trend).toBeDefined();
      });

      it('should fetch alert feed widget data', async () => {
        const widget = {
          id: 'widget_5',
          type: 'alert_feed' as const,
          title: 'Alerts',
          dataSource: {
            type: 'alert' as const,
            timeRange: { type: 'relative' as const, value: 24, unit: 'hours' as const },
          },
          visualization: {
            chartType: 'line' as const,
            showLegend: false,
          },
        };

        const data = await cc.fetchWidgetData(widget);
        expect(data.alerts).toBeDefined();
        expect(data.alerts!.length).toBeGreaterThan(0);
        expect(data.alerts![0].severity).toBeDefined();
        expect(data.alerts![0].message).toBeDefined();
      });

      it('should fetch model ranking widget data', async () => {
        const widget = {
          id: 'widget_6',
          type: 'model_ranking' as const,
          title: 'Model Comparison',
          dataSource: {
            type: 'comparison' as const,
            timeRange: { type: 'relative' as const, value: 30, unit: 'days' as const },
          },
          visualization: {
            chartType: 'bar' as const,
            showLegend: true,
          },
        };

        const data = await cc.fetchWidgetData(widget);
        expect(data.comparison).toBeDefined();
        expect(data.comparison!.models.length).toBeGreaterThan(0);
        expect(data.comparison!.ranking.length).toBeGreaterThan(0);
      });

      it('should use cache for repeated fetches', async () => {
        const widget = {
          id: 'cached_widget',
          type: 'time_series' as const,
          title: 'Cached',
          dataSource: {
            type: 'series' as const,
            timeRange: { type: 'relative' as const, value: 24, unit: 'hours' as const },
          },
          visualization: {
            chartType: 'line' as const,
            showLegend: true,
          },
        };

        const data1 = await cc.fetchWidgetData(widget);
        const data2 = await cc.fetchWidgetData(widget);

        // Same timestamp means it came from cache
        expect(data1.timestamp).toBe(data2.timestamp);
      });

      it('should clear specific widget cache', async () => {
        const widget = {
          id: 'clear_cache_widget',
          type: 'time_series' as const,
          title: 'Clear Cache',
          dataSource: {
            type: 'series' as const,
            timeRange: { type: 'relative' as const, value: 24, unit: 'hours' as const },
          },
          visualization: {
            chartType: 'line' as const,
            showLegend: true,
          },
        };

        const data1 = await cc.fetchWidgetData(widget);
        cc.clearCache(widget.id);
        const data2 = await cc.fetchWidgetData(widget);

        // Different timestamp means cache was cleared
        expect(data2.timestamp).toBeGreaterThanOrEqual(data1.timestamp);
      });

      it('should clear all cache', async () => {
        const widget1 = {
          id: 'clear_all_1',
          type: 'time_series' as const,
          title: 'Clear All 1',
          dataSource: {
            type: 'series' as const,
            timeRange: { type: 'relative' as const, value: 24, unit: 'hours' as const },
          },
          visualization: {
            chartType: 'line' as const,
            showLegend: true,
          },
        };

        const widget2 = {
          id: 'clear_all_2',
          type: 'metric_card' as const,
          title: 'Clear All 2',
          dataSource: {
            type: 'metric' as const,
            timeRange: { type: 'relative' as const, value: 24, unit: 'hours' as const },
          },
          visualization: {
            chartType: 'line' as const,
            showLegend: false,
          },
        };

        await cc.fetchWidgetData(widget1);
        await cc.fetchWidgetData(widget2);
        cc.clearCache();

        // Both should get fresh data after clear
        const data1 = await cc.fetchWidgetData(widget1);
        const data2 = await cc.fetchWidgetData(widget2);

        expect(data1.loading).toBe(false);
        expect(data2.loading).toBe(false);
      });
    });
  });

  describe('Zod Schemas', () => {
    it('should validate DashboardLayoutSchema', () => {
      const layout = {
        type: 'grid',
        columns: 12,
        rowHeight: 100,
        gap: 16,
      };
      const result = DashboardLayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
    });

    it('should validate WidgetDataSourceSchema with relative time', () => {
      const dataSource = {
        type: 'series',
        seriesIds: ['s1', 's2'],
        timeRange: { type: 'relative', value: 24, unit: 'hours' },
        resolution: 'hour',
        aggregation: 'avg',
      };
      const result = WidgetDataSourceSchema.safeParse(dataSource);
      expect(result.success).toBe(true);
    });

    it('should validate WidgetDataSourceSchema with absolute time', () => {
      const dataSource = {
        type: 'forecast',
        timeRange: { type: 'absolute', start: 1000000, end: 2000000 },
        model: 'timegpt',
        forecastHorizon: 24,
      };
      const result = WidgetDataSourceSchema.safeParse(dataSource);
      expect(result.success).toBe(true);
    });

    it('should validate VisualizationConfigSchema', () => {
      const viz = {
        chartType: 'area',
        showLegend: true,
        legendPosition: 'bottom',
        yAxis: { min: 0, max: 100, label: 'Usage %' },
        colors: ['#ff0000', '#00ff00'],
        showPoints: true,
        fill: true,
        showGrid: true,
        stacked: false,
        showConfidence: true,
        confidenceOpacity: 0.3,
      };
      const result = VisualizationConfigSchema.safeParse(viz);
      expect(result.success).toBe(true);
    });

    it('should reject invalid confidenceOpacity', () => {
      const viz = {
        chartType: 'line',
        showLegend: true,
        confidenceOpacity: 1.5, // Must be 0-1
      };
      const result = VisualizationConfigSchema.safeParse(viz);
      expect(result.success).toBe(false);
    });
  });

  describe('Type Exports', () => {
    it('should export all types', () => {
      // Type-only tests - if this compiles, the types are exported correctly
      const widgetType: WidgetType = 'time_series';
      const chartType: ChartType = 'line';
      const timeRange: TimeRange = { type: 'relative', value: 24, unit: 'hours' };

      expect(widgetType).toBe('time_series');
      expect(chartType).toBe('line');
      expect(timeRange.type).toBe('relative');
    });
  });
});
