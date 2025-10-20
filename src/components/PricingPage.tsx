import React, { useState } from 'react';
import { ArrowRight, Check, Star, Zap } from 'lucide-react';
import SubscriptionPlans from './SubscriptionPlans';
import { SubscriptionPlan } from '../types/subscription';

interface PricingPageProps {
  onPlanSelect?: (plan: SubscriptionPlan) => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({ onPlanSelect }) => {
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);

  const handlePlanSelect = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    if (onPlanSelect) {
      onPlanSelect(plan);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-purple-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Choose the Perfect Plan for Your Needs
            </h1>
            <p className="text-xl md:text-2xl text-blue-100 mb-8 max-w-3xl mx-auto">
              Get started with AI accuracy verification that scales with your business. 
              All plans include our core features with flexible pricing.
            </p>
            <div className="flex items-center justify-center space-x-6 text-blue-100">
              <span className="flex items-center gap-2">
                <Check className="w-5 h-5" />
                14-day free trial
              </span>
              <span className="flex items-center gap-2">
                <Check className="w-5 h-5" />
                No setup fees
              </span>
              <span className="flex items-center gap-2">
                <Check className="w-5 h-5" />
                Cancel anytime
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Plans */}
      <div className="py-16">
        <SubscriptionPlans 
          onPlanSelect={handlePlanSelect}
          showHeader={false}
        />
      </div>

      {/* Features Comparison */}
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-4">
            Compare Features
          </h2>
          <p className="text-xl text-slate-600 dark:text-slate-400">
            See what's included in each plan
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-700">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-medium text-slate-900 dark:text-slate-100">
                    Features
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-slate-900 dark:text-slate-100">
                    Basic
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-slate-900 dark:text-slate-100 relative">
                    <div className="flex items-center justify-center gap-2">
                      Pro
                      <Star className="w-4 h-4 text-yellow-500" />
                    </div>
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-medium text-slate-900 dark:text-slate-100">
                    Enterprise
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                <tr>
                  <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                    Monthly analyses
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-slate-600 dark:text-slate-400">
                    1,000
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-slate-600 dark:text-slate-400">
                    10,000
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-slate-600 dark:text-slate-400">
                    Unlimited
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                    Basic hallucination detection
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Check className="w-5 h-5 text-green-500 mx-auto" />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Check className="w-5 h-5 text-green-500 mx-auto" />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Check className="w-5 h-5 text-green-500 mx-auto" />
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                    Advanced seq-logprob analysis
                  </td>
                  <td className="px-6 py-4 text-center text-slate-400">
                    —
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Check className="w-5 h-5 text-green-500 mx-auto" />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Check className="w-5 h-5 text-green-500 mx-auto" />
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                    Team collaboration
                  </td>
                  <td className="px-6 py-4 text-center text-slate-400">
                    —
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Check className="w-5 h-5 text-green-500 mx-auto" />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Check className="w-5 h-5 text-green-500 mx-auto" />
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                    Custom model training
                  </td>
                  <td className="px-6 py-4 text-center text-slate-400">
                    —
                  </td>
                  <td className="px-6 py-4 text-center text-slate-400">
                    —
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Check className="w-5 h-5 text-green-500 mx-auto" />
                  </td>
                </tr>
                <tr>
                  <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                    Support level
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-slate-600 dark:text-slate-400">
                    Email
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-slate-600 dark:text-slate-400">
                    Priority
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-slate-600 dark:text-slate-400">
                    Dedicated
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-4">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Can I change my plan later?
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately, 
              and we'll prorate any billing adjustments.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              What happens during the free trial?
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              You get full access to all features of your chosen plan for 14 days. No credit card required 
              to start, and you can cancel anytime during the trial.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Is my data secure?
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              Absolutely. We use enterprise-grade security with 256-bit SSL encryption, SOC 2 compliance, 
              and regular security audits to protect your data.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Do you offer custom enterprise solutions?
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              Yes, our Enterprise plan includes custom integrations, on-premise deployment options, 
              and dedicated support. Contact our sales team for a personalized quote.
            </p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-slate-900 dark:bg-slate-800 text-white">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-slate-300 mb-8">
            Join thousands of teams already using HalluciFix to verify AI accuracy.
          </p>
          <button
            onClick={() => document.getElementById('pricing-plans')?.scrollIntoView({ behavior: 'smooth' })}
            className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-lg"
          >
            Choose Your Plan
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;