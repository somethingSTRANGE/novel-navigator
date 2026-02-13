// src/utils/logger.ts
let pluginName = 'PLUGIN';

export function setLoggerName(name: string) {
    pluginName = name;
}

export const logger = {
    info: (...args: any[]) =>
        console.info(`${pluginName}:`, ...args),
    warn: (...args: any[]) =>
        console.warn(`${pluginName}:`, ...args),
    error: (...args: any[]) =>
        console.error(`${pluginName}:`, ...args),
    debug: (...args: any[]) =>
        console.debug(`${pluginName}:`, ...args),
};