'use client';

import { Filter, Search, Calendar, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

interface RunsFiltersProps {
  onFilterChange: (filters: {
    search: string;
    status: string[];
    dateRange: string;
  }) => void;
}

export function RunsFilters({ onFilterChange }: RunsFiltersProps) {
  const [search, setSearch] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState('24h');

  const statuses = [
    { id: 'success', label: 'Success', icon: CheckCircle, color: 'text-emerald-400' },
    { id: 'failure', label: 'Failed', icon: XCircle, color: 'text-red-400' },
    { id: 'running', label: 'Running', icon: Clock, color: 'text-blue-400' },
    { id: 'warning', label: 'Warning', icon: AlertTriangle, color: 'text-yellow-400' },
  ];

  const handleStatusToggle = (statusId: string) => {
    const newStatuses = selectedStatuses.includes(statusId)
      ? selectedStatuses.filter(s => s !== statusId)
      : [...selectedStatuses, statusId];
    setSelectedStatuses(newStatuses);
    onFilterChange({ search, status: newStatuses, dateRange });
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    onFilterChange({ search: value, status: selectedStatuses, dateRange });
  };

  const handleDateRange = (value: string) => {
    setDateRange(value);
    onFilterChange({ search, status: selectedStatuses, dateRange: value });
  };

  return (
    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input
          type="text"
          placeholder="Search runs, workflows, or IDs..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-zinc-900/50 border border-zinc-700 rounded-lg text-zinc-200 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
        />
      </div>

      {/* Status Filters */}
      <div>
        <div className="flex items-center gap-2 mb-2 text-sm text-zinc-400">
          <Filter className="w-4 h-4" />
          <span>Status</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {statuses.map(({ id, label, icon: Icon, color }) => (
            <button
              key={id}
              onClick={() => handleStatusToggle(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
                selectedStatuses.includes(id)
                  ? 'bg-zinc-700 text-zinc-200 border border-zinc-600'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-750'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Date Range */}
      <div>
        <div className="flex items-center gap-2 mb-2 text-sm text-zinc-400">
          <Calendar className="w-4 h-4" />
          <span>Time Range</span>
        </div>
        <div className="flex gap-2">
          {['1h', '24h', '7d', '30d', 'all'].map((range) => (
            <button
              key={range}
              onClick={() => handleDateRange(range)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                dateRange === range
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-750'
              }`}
            >
              {range === 'all' ? 'All Time' : range}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
