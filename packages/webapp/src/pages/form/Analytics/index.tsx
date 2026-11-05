import FormAnalyticsHeatmap from './Heatmap'
import FormAnalyticsOverview from './Overview'
import FormAnalyticsReport from './Report'
import FormAnalyticsScheduledReports from './ScheduledReports'
import FormAnalyticsShares from './Shares'

export default function FormAnalytics() {
  return (
    <>
      <FormAnalyticsOverview />
      <FormAnalyticsHeatmap />
      <FormAnalyticsReport />
      <FormAnalyticsShares />
      <FormAnalyticsScheduledReports />
    </>
  )
}
