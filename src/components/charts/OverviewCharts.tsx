
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  LineChart, 
  Line,
  Legend
} from "recharts";

const OverviewCharts = () => {
  // Mock data for charts
  const authStatusData = [
    { name: "Pass", value: 141203, color: "#10b981" },
    { name: "Fail", value: 6629, color: "#ef4444" }
  ];

  const providerData = [
    { provider: "Google", emails: 65432, successRate: 98.2 },
    { provider: "Microsoft", emails: 42156, successRate: 96.1 },
    { provider: "Yahoo", emails: 21098, successRate: 94.8 },
    { provider: "Amazon SES", emails: 19146, successRate: 99.1 }
  ];

  const trendData = [
    { date: "Jan 10", success: 94.2, total: 12430 },
    { date: "Jan 11", success: 95.1, total: 13205 },
    { date: "Jan 12", success: 93.8, total: 11987 },
    { date: "Jan 13", success: 96.3, total: 14521 },
    { date: "Jan 14", success: 94.9, total: 13876 },
    { date: "Jan 15", success: 97.1, total: 15234 }
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium">{`${label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {`${entry.dataKey}: ${entry.value}${entry.dataKey === 'success' ? '%' : ''}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Authentication Status Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Authentication Status</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={authStatusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {authStatusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [value.toLocaleString(), "Emails"]} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Provider Performance Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Email Volume by Provider</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={providerData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="provider" />
              <YAxis />
              <Tooltip 
                formatter={(value, name) => [
                  name === 'emails' ? value.toLocaleString() : `${value}%`,
                  name === 'emails' ? 'Emails' : 'Success Rate'
                ]}
              />
              <Bar dataKey="emails" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Success Rate Trend */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Authentication Success Rate Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis yAxisId="left" domain={[90, 100]} />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="success" 
                stroke="#10b981" 
                strokeWidth={3}
                name="Success Rate (%)"
                dot={{ fill: "#10b981", strokeWidth: 2, r: 4 }}
              />
              <Bar 
                yAxisId="right"
                dataKey="total" 
                fill="#e5e7eb" 
                opacity={0.6}
                name="Total Emails"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default OverviewCharts;
