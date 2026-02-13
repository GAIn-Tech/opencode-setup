'use client';

import React from 'react';

interface Step {
  step_id: string;
  status: string;
  result: any;
  updated_at: string;
}

export const WorkflowTree: React.FC<{ steps: Step[] }> = ({ steps }) => {
  // Simple flat list for now, we can add tree hierarchy later based on step_id pattern
  return (
    <div className="space-y-2">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Workflow Steps</h2>
      {steps.length === 0 ? (
        <p className="text-gray-500 italic">No steps recorded yet.</p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Step ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {steps.map((step) => (
                <tr key={step.step_id} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600 font-mono">
                    {step.step_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                      ${step.status === 'completed' ? 'bg-green-100 text-green-800' : 
                        step.status === 'failed' ? 'bg-red-100 text-red-800' : 
                        step.status === 'running' ? 'bg-blue-100 text-blue-800' : 
                        'bg-gray-100 text-gray-800'}`}>
                      {step.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(step.updated_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
