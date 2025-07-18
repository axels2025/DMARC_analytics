import { useState } from "react";
import { X, Shield, AlertTriangle, CheckCircle, TrendingUp, Globe, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface InsightsModalProps {
  isOpen: boolean;
  onClose: () => void;
  metrics: {
    totalReports: number;
    totalEmails: number;
    successRate: number;
    uniqueIPs: number;
    activeDomains: number;
  };
}

const InsightsModal = ({ isOpen, onClose, metrics }: InsightsModalProps) => {
  const [activeTab, setActiveTab] = useState('security');

  if (!isOpen) return null;

  // Generate insights based on metrics
  const generateSecurityInsights = () => {
    const insights = [];
    
    if (metrics.successRate < 90) {
      insights.push({
        type: 'warning',
        title: 'Low Authentication Success Rate',
        description: `Your current success rate is ${metrics.successRate}%. Consider reviewing your SPF and DKIM configurations.`,
        action: 'Review DNS records and authentication setup',
        priority: 'high'
      });
    } else if (metrics.successRate < 95) {
      insights.push({
        type: 'info',
        title: 'Good Authentication Rate',
        description: `Your success rate of ${metrics.successRate}% is good, but there's room for improvement.`,
        action: 'Fine-tune SPF and DKIM alignment',
        priority: 'medium'
      });
    } else {
      insights.push({
        type: 'success',
        title: 'Excellent Authentication Rate',
        description: `Your success rate of ${metrics.successRate}% is excellent! Keep monitoring for any changes.`,
        action: 'Continue monitoring and maintain current setup',
        priority: 'low'
      });
    }

    if (metrics.uniqueIPs > 10) {
      insights.push({
        type: 'info',
        title: 'Multiple Email Sources',
        description: `You have ${metrics.uniqueIPs} unique IP addresses sending email. Ensure all are authorized.`,
        action: 'Review and validate all sending IP addresses',
        priority: 'medium'
      });
    }

    if (metrics.totalReports < 5) {
      insights.push({
        type: 'info',
        title: 'Limited Report Data',
        description: 'Upload more reports to get better insights and trend analysis.',
        action: 'Upload more DMARC reports for comprehensive analysis',
        priority: 'medium'
      });
    }

    return insights;
  };

  const generateRecommendations = () => {
    const recommendations = [];

    // Policy recommendations
    if (metrics.successRate >= 98) {
      recommendations.push({
        title: 'Consider Moving to p=reject',
        description: 'Your high success rate indicates you\'re ready for the strictest DMARC policy.',
        steps: [
          'Monitor current p=quarantine policy for 2-4 weeks',
          'Ensure all legitimate email sources are properly configured',
          'Update DMARC record to p=reject',
          'Continue monitoring for any delivery issues'
        ]
      });
    } else if (metrics.successRate >= 95) {
      recommendations.push({
        title: 'Move to p=quarantine',
        description: 'Your success rate is good enough to start quarantining failing emails.',
        steps: [
          'Update DMARC record to p=quarantine',
          'Monitor email delivery for 2-4 weeks',
          'Address any SPF/DKIM alignment issues',
          'Plan transition to p=reject when ready'
        ]
      });
    } else {
      recommendations.push({
        title: 'Improve Authentication Setup',
        description: 'Focus on improving your SPF and DKIM configuration before tightening policy.',
        steps: [
          'Review and update SPF records',
          'Ensure DKIM is properly configured',
          'Check for unauthorized sending sources',
          'Monitor improvements before changing policy'
        ]
      });
    }

    // Monitoring recommendations
    recommendations.push({
      title: 'Set Up Regular Monitoring',
      description: 'Establish a routine for monitoring your DMARC reports.',
      steps: [
        'Schedule weekly DMARC report reviews',
        'Set up alerts for significant changes in success rates',
        'Track new IP addresses and email sources',
        'Document any configuration changes'
      ]
    });

    return recommendations;
  };

  const securityInsights = generateSecurityInsights();
  const recommendations = generateRecommendations();

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      default:
        return <Shield className="w-5 h-5 text-blue-500" />;
    }
  };

  const getPriorityBadge = (priority: string) => {
    const colors: { [key: string]: 'destructive' | 'secondary' | 'default' } = {
      high: 'destructive',
      medium: 'secondary',
      low: 'default'
    };
    return <Badge variant={colors[priority] || 'default'}>{priority.toUpperCase()}</Badge>;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">DMARC Insights & Recommendations</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex space-x-4 mb-6 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('security')}
              className={`py-2 px-4 font-medium transition-colors ${
                activeTab === 'security'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Security Analysis
            </button>
            <button
              onClick={() => setActiveTab('recommendations')}
              className={`py-2 px-4 font-medium transition-colors ${
                activeTab === 'recommendations'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Recommendations
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Mail className="w-5 h-5 text-blue-500" />
                      <h3 className="font-medium">Email Volume</h3>
                    </div>
                    <p className="text-2xl font-bold">{metrics.totalEmails.toLocaleString()}</p>
                    <p className="text-sm text-gray-600">Total emails analyzed</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Shield className="w-5 h-5 text-green-500" />
                      <h3 className="font-medium">Success Rate</h3>
                    </div>
                    <p className="text-2xl font-bold text-green-600">{metrics.successRate}%</p>
                    <p className="text-sm text-gray-600">Authentication success</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Globe className="w-5 h-5 text-purple-500" />
                      <h3 className="font-medium">Source IPs</h3>
                    </div>
                    <p className="text-2xl font-bold">{metrics.uniqueIPs}</p>
                    <p className="text-sm text-gray-600">Unique sending sources</p>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Security Insights</h3>
                {securityInsights.map((insight, index) => (
                  <Card key={index}>
                    <CardContent className="p-4">
                      <div className="flex items-start space-x-3">
                        {getInsightIcon(insight.type)}
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">{insight.title}</h4>
                            {getPriorityBadge(insight.priority)}
                          </div>
                          <p className="text-gray-600 mb-2">{insight.description}</p>
                          <p className="text-sm text-blue-600 font-medium">
                            Recommended Action: {insight.action}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'recommendations' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-center space-x-2 mb-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  <h3 className="font-medium text-blue-900">Next Steps</h3>
                </div>
                <p className="text-blue-800">
                  Based on your current DMARC configuration and success rate, here are our recommendations 
                  to improve your email security posture.
                </p>
              </div>

              <div className="space-y-6">
                {recommendations.map((rec, index) => (
                  <Card key={index}>
                    <CardHeader>
                      <CardTitle className="text-lg">{rec.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-600 mb-4">{rec.description}</p>
                      <div>
                        <h4 className="font-medium mb-2">Implementation Steps:</h4>
                        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                          {rec.steps.map((step, stepIndex) => (
                            <li key={stepIndex}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500">
                Insights generated based on your DMARC report data
              </p>
              <Button onClick={onClose} variant="outline">
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InsightsModal;