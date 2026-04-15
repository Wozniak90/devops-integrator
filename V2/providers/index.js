/**
 * Provider Registry
 * Loads and manages all PM tool providers.
 */

const azureDevOps = require('./azure-devops');
const jira = require('./jira');
// Future providers:
// const github = require('./github');
// const gitlab = require('./gitlab');
// const linear = require('./linear');

const ALL_PROVIDERS = [
  azureDevOps,
  jira,
  // github,
  // gitlab,
  // linear,
];

/**
 * Returns only the providers that are enabled in config.
 * @param {Object} providersConfig - The "providers" section of config.json
 * @returns {Array} Active provider modules
 */
function getActiveProviders(providersConfig) {
  return ALL_PROVIDERS.filter(p => {
    const cfg = providersConfig?.[p.id];
    return cfg?.enabled === true;
  });
}

/**
 * Fetches assigned items from all active providers in parallel.
 * Failures in one provider do not affect others.
 * @param {Object} providersConfig
 * @returns {Promise<WorkItem[]>} Merged and deduplicated list
 */
async function getAllAssignedItems(providersConfig) {
  const active = getActiveProviders(providersConfig);

  const results = await Promise.allSettled(
    active.map(p => p.getAssignedItems(providersConfig[p.id]))
  );

  const items = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      console.error(`[providers] Failed to fetch items:`, result.reason?.message);
    }
  }

  return items;
}

/**
 * Fetches recent activity from all active providers in parallel.
 * @param {Object} providersConfig
 * @param {number} days
 * @returns {Promise<WorkItem[]>}
 */
async function getAllActivity(providersConfig, days = 14) {
  const active = getActiveProviders(providersConfig);

  const results = await Promise.allSettled(
    active.map(p => p.getMyActivity(providersConfig[p.id], days))
  );

  const items = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      console.error(`[providers] Failed to fetch activity:`, result.reason?.message);
    }
  }

  // Sort by updatedAt descending
  return items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

module.exports = {
  ALL_PROVIDERS,
  getActiveProviders,
  getAllAssignedItems,
  getAllActivity,
};
