/**
 * Phase 58: Command Center v1
 *
 * Dashboard and visualization infrastructure:
 * - Dashboard widget definitions
 * - Multi-series comparison views
 * - Real-time data streaming
 * - Forecast visualization
 * - Alert displays
 *
 * @module @gwi/core/command-center
 */

import { z } from 'zod';
import type { TimeResolution, AggregationType } from '../time-series/index.js';
import type { ForecastModel, ForecastPoint } from '../forecasting/index.js';
import type { AccuracyMetric } from '../backtesting/index.js';
import type { StorageTier } from '../series-storage/index.js';

// =============================================================================
// COMMAND CENTER VERSION
// =============================================================================

export const COMMAND_CENTER_VERSION = '1.0.0';

// =============================================================================
// ERROR CODES
// =============================================================================

export const CommandCenterErrorCodes = {
  // Dashboard errors (1xxx)
  INVALID_DASHBOARD: 'CC_1001',
  DASHBOARD_NOT_FOUND: 'CC_1002',
  WIDGET_NOT_FOUND: 'CC_1003',
  LAYOUT_INVALID: 'CC_1004',

  // Data errors (2xxx)
  DATA_FETCH_FAILED: 'CC_2001',
  SERIES_NOT_FOUND: 'CC_2002',
  QUERY_TIMEOUT: 'CC_2003',
  AGGREGATION_FAILED: 'CC_2004',

  // Streaming errors (3xxx)
  STREAM_FAILED: 'CC_3001',
  SUBSCRIPTION_FAILED: 'CC_3002',
  RECONNECT_FAILED: 'CC_3003',
  BACKPRESSURE: 'CC_3004',

  // Visualization errors (4xxx)
  RENDER_FAILED: 'CC_4001',
  INVALID_CHART_TYPE: 'CC_4002',
  EXPORT_FAILED: 'CC_4003',
  THEME_ERROR: 'CC_4004',
} as const;

export type CommandCenterErrorCode =
  (typeof CommandCenterErrorCodes)[keyof typeof CommandCenterErrorCodes];

// =============================================================================
// WIDGET TYPES
// =============================================================================

export type WidgetType =
  | 'time_series'       // Line/area chart for time series
  | 'forecast'          // Forecast with confidence intervals
  | 'comparison'        // Multi-series comparison
  | 'backtest'          // Backtest results visualization
  | 'metric_card'       // Single metric display
  | 'table'             // Data table
  | 'heatmap'           // Heatmap for correlations
  | 'alert_feed'        // Live alert feed
  | 'model_ranking'     // Model comparison ranking
  | 'anomaly_map';      // Anomaly visualization

export type ChartType =
  | 'line'
  | 'area'
  | 'bar'
  | 'scatter'
  | 'candlestick'
  | 'heatmap';

export type TimeRange =
  | { type: 'relative'; value: number; unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months' }
  | { type: 'absolute'; start: number; end: number };

// =============================================================================
// DASHBOARD CONFIG
// =============================================================================

export interface DashboardConfig {
  /** Dashboard ID */
  id: string;
  /** Dashboard name */
  name: string;
  /** Description */
  description?: string;
  /** Tenant ID */
  tenantId: string;
  /** Owner user ID */
  ownerId: string;
  /** Widgets */
  widgets: WidgetConfig[];
  /** Layout */
  layout: DashboardLayout;
  /** Global filters */
  globalFilters?: DashboardFilter[];
  /** Auto-refresh interval (seconds, 0 = disabled) */
  refreshInterval: number;
  /** Theme */
  theme: 'light' | 'dark' | 'system';
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
}

export interface DashboardLayout {
  /** Layout type */
  type: 'grid' | 'masonry' | 'fixed';
  /** Number of columns */
  columns: number;
  /** Row height in pixels */
  rowHeight: number;
  /** Gap between widgets */
  gap: number;
  /** Widget positions (for fixed layout) */
  positions?: Array<{
    widgetId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

export interface DashboardFilter {
  /** Filter ID */
  id: string;
  /** Filter type */
  type: 'time_range' | 'series' | 'label' | 'model';
  /** Filter label */
  label: string;
  /** Default value */
  defaultValue?: unknown;
  /** Applies to widget IDs (empty = all) */
  appliesTo?: string[];
}

// =============================================================================
// WIDGET CONFIG
// =============================================================================

export interface WidgetConfig {
  /** Widget ID */
  id: string;
  /** Widget type */
  type: WidgetType;
  /** Widget title */
  title: string;
  /** Widget description */
  description?: string;
  /** Data source configuration */
  dataSource: WidgetDataSource;
  /** Visualization options */
  visualization: VisualizationConfig;
  /** Refresh override (seconds) */
  refreshOverride?: number;
  /** Widget-specific options */
  options?: Record<string, unknown>;
}

export interface WidgetDataSource {
  /** Data source type */
  type: 'series' | 'forecast' | 'backtest' | 'comparison' | 'alert' | 'metric';
  /** Series IDs */
  seriesIds?: string[];
  /** Time range */
  timeRange: TimeRange;
  /** Resolution for downsampling */
  resolution?: TimeResolution;
  /** Aggregation type */
  aggregation?: AggregationType;
  /** Model (for forecasts) */
  model?: ForecastModel;
  /** Forecast horizon */
  forecastHorizon?: number;
  /** Backtest config ID */
  backtestId?: string;
  /** Metric name (for metric cards) */
  metricName?: string;
}

export interface VisualizationConfig {
  /** Chart type */
  chartType: ChartType;
  /** Show legend */
  showLegend: boolean;
  /** Legend position */
  legendPosition?: 'top' | 'bottom' | 'left' | 'right';
  /** Y-axis configuration */
  yAxis?: {
    min?: number;
    max?: number;
    label?: string;
    format?: string;
  };
  /** X-axis configuration */
  xAxis?: {
    label?: string;
    format?: string;
  };
  /** Colors */
  colors?: string[];
  /** Show data points */
  showPoints?: boolean;
  /** Fill area under line */
  fill?: boolean;
  /** Show grid */
  showGrid?: boolean;
  /** Stacked (for bar/area) */
  stacked?: boolean;
  /** Show confidence intervals */
  showConfidence?: boolean;
  /** Confidence fill opacity */
  confidenceOpacity?: number;
}

// =============================================================================
// DATA TYPES
// =============================================================================

export interface WidgetData {
  /** Widget ID */
  widgetId: string;
  /** Data timestamp */
  timestamp: number;
  /** Time series data */
  series?: SeriesData[];
  /** Forecast data */
  forecast?: ForecastData;
  /** Backtest data */
  backtest?: BacktestData;
  /** Comparison data */
  comparison?: ComparisonData;
  /** Metric data */
  metric?: MetricData;
  /** Alert data */
  alerts?: AlertData[];
  /** Loading state */
  loading: boolean;
  /** Error message */
  error?: string;
}

export interface SeriesData {
  /** Series ID */
  seriesId: string;
  /** Series name */
  name: string;
  /** Data points */
  points: Array<{
    timestamp: number;
    value: number;
    lower?: number;
    upper?: number;
  }>;
  /** Series metadata */
  metadata?: {
    unit?: string;
    color?: string;
    tier?: StorageTier;
  };
}

export interface ForecastData {
  /** Historical data */
  historical: SeriesData;
  /** Forecasted data */
  forecast: ForecastPoint[];
  /** Model used */
  model: ForecastModel;
  /** Metrics */
  metrics?: {
    mae?: number;
    rmse?: number;
    mape?: number;
  };
}

export interface BacktestData {
  /** Model tested */
  model: ForecastModel;
  /** Aggregated metrics */
  metrics: Record<AccuracyMetric, number>;
  /** Fold results for visualization */
  foldResults: Array<{
    foldIndex: number;
    actuals: number[];
    predictions: number[];
    metrics: Record<AccuracyMetric, number>;
  }>;
}

export interface ComparisonData {
  /** Models compared */
  models: ForecastModel[];
  /** Metric comparison */
  metricComparison: Record<AccuracyMetric, Record<ForecastModel, number>>;
  /** Ranking */
  ranking: Array<{ model: ForecastModel; rank: number }>;
  /** Best model per metric */
  bestPerMetric: Record<AccuracyMetric, ForecastModel>;
}

export interface MetricData {
  /** Metric name */
  name: string;
  /** Current value */
  value: number;
  /** Previous value (for comparison) */
  previousValue?: number;
  /** Change percentage */
  changePercent?: number;
  /** Trend direction */
  trend?: 'up' | 'down' | 'stable';
  /** Unit */
  unit?: string;
  /** Threshold for alerting */
  threshold?: number;
  /** Alert status */
  alertStatus?: 'ok' | 'warning' | 'critical';
}

export interface AlertData {
  /** Alert ID */
  id: string;
  /** Alert severity */
  severity: 'info' | 'warning' | 'critical';
  /** Alert message */
  message: string;
  /** Series ID (if applicable) */
  seriesId?: string;
  /** Timestamp */
  timestamp: number;
  /** Acknowledged */
  acknowledged: boolean;
}

// =============================================================================
// COMMAND CENTER
// =============================================================================

/**
 * Command Center for dashboard management
 */
export class CommandCenter {
  private dashboards: Map<string, DashboardConfig> = new Map();
  private widgetDataCache: Map<string, WidgetData> = new Map();
  private dashboardCounter = 0;
  private widgetCounter = 0;

  /**
   * Create a new dashboard
   */
  createDashboard(
    config: Omit<DashboardConfig, 'id' | 'createdAt' | 'updatedAt'>
  ): DashboardConfig {
    const dashboard: DashboardConfig = {
      ...config,
      id: `dashboard_${++this.dashboardCounter}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.dashboards.set(dashboard.id, dashboard);
    return dashboard;
  }

  /**
   * Get a dashboard by ID
   */
  getDashboard(dashboardId: string): DashboardConfig | undefined {
    return this.dashboards.get(dashboardId);
  }

  /**
   * List dashboards for a tenant
   */
  listDashboards(tenantId: string): DashboardConfig[] {
    return Array.from(this.dashboards.values()).filter(
      d => d.tenantId === tenantId
    );
  }

  /**
   * Update a dashboard
   */
  updateDashboard(
    dashboardId: string,
    updates: Partial<Omit<DashboardConfig, 'id' | 'createdAt'>>
  ): DashboardConfig | undefined {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return undefined;

    const updated = {
      ...dashboard,
      ...updates,
      updatedAt: Date.now(),
    };
    this.dashboards.set(dashboardId, updated);
    return updated;
  }

  /**
   * Delete a dashboard
   */
  deleteDashboard(dashboardId: string): boolean {
    return this.dashboards.delete(dashboardId);
  }

  /**
   * Add a widget to a dashboard
   */
  addWidget(
    dashboardId: string,
    widget: Omit<WidgetConfig, 'id'>
  ): WidgetConfig | undefined {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return undefined;

    const newWidget: WidgetConfig = {
      ...widget,
      id: `widget_${++this.widgetCounter}`,
    };
    dashboard.widgets.push(newWidget);
    dashboard.updatedAt = Date.now();

    return newWidget;
  }

  /**
   * Update a widget
   */
  updateWidget(
    dashboardId: string,
    widgetId: string,
    updates: Partial<Omit<WidgetConfig, 'id'>>
  ): WidgetConfig | undefined {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return undefined;

    const widgetIndex = dashboard.widgets.findIndex(w => w.id === widgetId);
    if (widgetIndex === -1) return undefined;

    const updated = {
      ...dashboard.widgets[widgetIndex],
      ...updates,
    };
    dashboard.widgets[widgetIndex] = updated;
    dashboard.updatedAt = Date.now();

    return updated;
  }

  /**
   * Remove a widget
   */
  removeWidget(dashboardId: string, widgetId: string): boolean {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return false;

    const initialLength = dashboard.widgets.length;
    dashboard.widgets = dashboard.widgets.filter(w => w.id !== widgetId);
    dashboard.updatedAt = Date.now();

    return dashboard.widgets.length < initialLength;
  }

  /**
   * Fetch widget data (mock implementation)
   */
  async fetchWidgetData(
    widget: WidgetConfig,
    _globalFilters?: DashboardFilter[]
  ): Promise<WidgetData> {
    // Check cache
    const cached = this.widgetDataCache.get(widget.id);
    if (cached && Date.now() - cached.timestamp < 30000) {
      return cached;
    }

    // Mock data generation based on widget type
    const data: WidgetData = {
      widgetId: widget.id,
      timestamp: Date.now(),
      loading: false,
    };

    switch (widget.type) {
      case 'time_series':
      case 'comparison':
        data.series = this.generateMockSeriesData(widget);
        break;

      case 'forecast':
        data.forecast = this.generateMockForecastData(widget);
        break;

      case 'backtest':
        data.backtest = this.generateMockBacktestData(widget);
        break;

      case 'metric_card':
        data.metric = this.generateMockMetricData(widget);
        break;

      case 'alert_feed':
        data.alerts = this.generateMockAlertData();
        break;

      case 'model_ranking':
        data.comparison = this.generateMockComparisonData(widget);
        break;
    }

    // Cache the data
    this.widgetDataCache.set(widget.id, data);

    return data;
  }

  private generateMockSeriesData(widget: WidgetConfig): SeriesData[] {
    const seriesIds = widget.dataSource.seriesIds ?? ['series_1'];
    const series: SeriesData[] = [];

    for (const seriesId of seriesIds) {
      const points = [];
      const now = Date.now();
      for (let i = 0; i < 100; i++) {
        points.push({
          timestamp: now - (100 - i) * 3600000,
          value: 100 + Math.sin(i / 10) * 20 + Math.random() * 5,
        });
      }
      series.push({
        seriesId,
        name: seriesId.replace('_', ' ').toUpperCase(),
        points,
      });
    }

    return series;
  }

  private generateMockForecastData(widget: WidgetConfig): ForecastData {
    const historical: SeriesData = {
      seriesId: 'historical',
      name: 'Historical',
      points: [],
    };

    const now = Date.now();
    for (let i = 0; i < 50; i++) {
      historical.points.push({
        timestamp: now - (50 - i) * 3600000,
        value: 100 + Math.sin(i / 10) * 20 + Math.random() * 5,
      });
    }

    const forecast: ForecastPoint[] = [];
    const lastValue = historical.points[historical.points.length - 1].value;
    const horizon = widget.dataSource.forecastHorizon ?? 24;

    for (let i = 0; i < horizon; i++) {
      const timestamp = now + (i + 1) * 3600000;
      const value = lastValue + Math.sin((50 + i) / 10) * 20;
      forecast.push({
        timestamp,
        value,
        lower: value - 10,
        upper: value + 10,
        confidenceLevel: 0.95,
        model: widget.dataSource.model ?? 'exponential',
      });
    }

    return {
      historical,
      forecast,
      model: widget.dataSource.model ?? 'exponential',
      metrics: {
        mae: 3.2,
        rmse: 4.1,
        mape: 2.8,
      },
    };
  }

  private generateMockBacktestData(widget: WidgetConfig): BacktestData {
    const foldResults = [];
    for (let i = 0; i < 5; i++) {
      const actuals = Array.from({ length: 12 }, (_, j) => 100 + Math.sin(j) * 10);
      const predictions = actuals.map(a => a + (Math.random() - 0.5) * 5);
      foldResults.push({
        foldIndex: i,
        actuals,
        predictions,
        metrics: {
          mae: 2.5 + Math.random(),
          mse: 8 + Math.random() * 2,
          rmse: 2.8 + Math.random() * 0.5,
          mape: 2 + Math.random(),
        } as Record<AccuracyMetric, number>,
      });
    }

    return {
      model: widget.dataSource.model ?? 'exponential',
      metrics: {
        mae: 2.7,
        mse: 9.1,
        rmse: 3.0,
        mape: 2.3,
      } as Record<AccuracyMetric, number>,
      foldResults,
    };
  }

  private generateMockMetricData(widget: WidgetConfig): MetricData {
    const value = 95 + Math.random() * 10;
    const previousValue = 90 + Math.random() * 10;
    const changePercent = ((value - previousValue) / previousValue) * 100;

    return {
      name: widget.dataSource.metricName ?? 'Forecast Accuracy',
      value,
      previousValue,
      changePercent,
      trend: changePercent > 1 ? 'up' : changePercent < -1 ? 'down' : 'stable',
      unit: '%',
      threshold: 90,
      alertStatus: value >= 90 ? 'ok' : value >= 80 ? 'warning' : 'critical',
    };
  }

  private generateMockAlertData(): AlertData[] {
    return [
      {
        id: 'alert_1',
        severity: 'warning',
        message: 'Forecast accuracy dropped below threshold',
        seriesId: 'cpu_usage',
        timestamp: Date.now() - 600000,
        acknowledged: false,
      },
      {
        id: 'alert_2',
        severity: 'info',
        message: 'New model deployed for sales forecast',
        timestamp: Date.now() - 3600000,
        acknowledged: true,
      },
      {
        id: 'alert_3',
        severity: 'critical',
        message: 'Data ingestion pipeline stalled',
        timestamp: Date.now() - 120000,
        acknowledged: false,
      },
    ];
  }

  private generateMockComparisonData(_widget: WidgetConfig): ComparisonData {
    const models: ForecastModel[] = ['naive', 'exponential', 'linear_trend', 'timegpt'];

    const metricComparison: Record<AccuracyMetric, Record<ForecastModel, number>> = {
      mae: { naive: 5.2, exponential: 3.8, linear_trend: 4.1, timegpt: 2.9 } as Record<ForecastModel, number>,
      rmse: { naive: 6.8, exponential: 5.1, linear_trend: 5.4, timegpt: 3.8 } as Record<ForecastModel, number>,
      mape: { naive: 4.5, exponential: 3.2, linear_trend: 3.5, timegpt: 2.4 } as Record<ForecastModel, number>,
    } as Record<AccuracyMetric, Record<ForecastModel, number>>;

    return {
      models,
      metricComparison,
      ranking: [
        { model: 'timegpt', rank: 1 },
        { model: 'exponential', rank: 2 },
        { model: 'linear_trend', rank: 3 },
        { model: 'naive', rank: 4 },
      ],
      bestPerMetric: {
        mae: 'timegpt',
        rmse: 'timegpt',
        mape: 'timegpt',
      } as Record<AccuracyMetric, ForecastModel>,
    };
  }

  /**
   * Clear widget data cache
   */
  clearCache(widgetId?: string): void {
    if (widgetId) {
      this.widgetDataCache.delete(widgetId);
    } else {
      this.widgetDataCache.clear();
    }
  }
}

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

const TimeRangeSchema = z.union([
  z.object({
    type: z.literal('relative'),
    value: z.number().positive(),
    unit: z.enum(['minutes', 'hours', 'days', 'weeks', 'months']),
  }),
  z.object({
    type: z.literal('absolute'),
    start: z.number().int(),
    end: z.number().int(),
  }),
]);

// ForecastModel enum values
const ForecastModelEnum = z.enum([
  'naive', 'seasonal_naive', 'moving_average', 'exponential', 'holt_winters', 'linear_trend',  // BaselineModel
  'timegpt', 'arima', 'prophet', 'neural', 'ensemble',  // AdvancedModel
]);

export const WidgetDataSourceSchema = z.object({
  type: z.enum(['series', 'forecast', 'backtest', 'comparison', 'alert', 'metric']),
  seriesIds: z.array(z.string()).optional(),
  timeRange: TimeRangeSchema,
  resolution: z.enum(['millisecond', 'second', 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year']).optional(),
  aggregation: z.enum(['sum', 'avg', 'min', 'max', 'count', 'first', 'last', 'median', 'stddev', 'variance', 'percentile_90', 'percentile_95', 'percentile_99']).optional(),
  model: ForecastModelEnum.optional(),
  forecastHorizon: z.number().int().positive().optional(),
  backtestId: z.string().optional(),
  metricName: z.string().optional(),
});

export const VisualizationConfigSchema = z.object({
  chartType: z.enum(['line', 'area', 'bar', 'scatter', 'candlestick', 'heatmap']),
  showLegend: z.boolean(),
  legendPosition: z.enum(['top', 'bottom', 'left', 'right']).optional(),
  yAxis: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    label: z.string().optional(),
    format: z.string().optional(),
  }).optional(),
  xAxis: z.object({
    label: z.string().optional(),
    format: z.string().optional(),
  }).optional(),
  colors: z.array(z.string()).optional(),
  showPoints: z.boolean().optional(),
  fill: z.boolean().optional(),
  showGrid: z.boolean().optional(),
  stacked: z.boolean().optional(),
  showConfidence: z.boolean().optional(),
  confidenceOpacity: z.number().min(0).max(1).optional(),
});

export const WidgetConfigSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'time_series', 'forecast', 'comparison', 'backtest', 'metric_card',
    'table', 'heatmap', 'alert_feed', 'model_ranking', 'anomaly_map',
  ]),
  title: z.string().min(1),
  description: z.string().optional(),
  dataSource: WidgetDataSourceSchema,
  visualization: VisualizationConfigSchema,
  refreshOverride: z.number().int().positive().optional(),
  options: z.record(z.unknown()).optional(),
});

export const DashboardLayoutSchema = z.object({
  type: z.enum(['grid', 'masonry', 'fixed']),
  columns: z.number().int().positive().max(24),
  rowHeight: z.number().int().positive(),
  gap: z.number().int().nonnegative(),
  positions: z.array(z.object({
    widgetId: z.string(),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })).optional(),
});

export const DashboardConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  tenantId: z.string().min(1),
  ownerId: z.string().min(1),
  widgets: z.array(WidgetConfigSchema),
  layout: DashboardLayoutSchema,
  globalFilters: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(['time_range', 'series', 'label', 'model']),
    label: z.string().min(1),
    defaultValue: z.unknown().optional(),
    appliesTo: z.array(z.string()).optional(),
  })).optional(),
  refreshInterval: z.number().int().nonnegative(),
  theme: z.enum(['light', 'dark', 'system']),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

export function validateDashboardConfig(
  config: unknown
): { success: boolean; data?: DashboardConfig; errors?: string[] } {
  const result = DashboardConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
  };
}

export function validateWidgetConfig(
  config: unknown
): { success: boolean; data?: WidgetConfig; errors?: string[] } {
  const result = WidgetConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
  };
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create default dashboard configuration
 */
export function createDashboardConfig(
  params: Pick<DashboardConfig, 'name' | 'tenantId' | 'ownerId'> &
    Partial<DashboardConfig>
): Omit<DashboardConfig, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    widgets: [],
    layout: {
      type: 'grid',
      columns: 12,
      rowHeight: 100,
      gap: 16,
    },
    refreshInterval: 30,
    theme: 'system',
    ...params,
  };
}

/**
 * Create a widget configuration
 */
export function createWidgetConfig(
  params: Pick<WidgetConfig, 'type' | 'title' | 'dataSource'> &
    Partial<WidgetConfig>
): Omit<WidgetConfig, 'id'> {
  return {
    visualization: {
      chartType: 'line',
      showLegend: true,
      showGrid: true,
    },
    ...params,
  };
}

/**
 * Create a Command Center instance
 */
export function createCommandCenter(): CommandCenter {
  return new CommandCenter();
}
