import mapValues from 'lodash/mapValues';
import dedent from 'ts-dedent';
import { logger } from '@storybook/client-logger';
import { SBType, ArgTypesEnhancer } from './types';
import { combineParameters } from './parameters';

const inferType = (value: any, name: string, visited: Set<any>): SBType => {
  const type = typeof value;
  switch (type) {
    case 'boolean':
    case 'string':
    case 'number':
    case 'function':
      return { name: type };
    case 'symbol':
      return { name: 'other', value: 'symbol' };
    default:
      break;
  }
  if (value) {
    if (visited.has(value)) {
      logger.warn(dedent`
        We've detected a cycle in arg '${name}'. Args should be JSON-serializable (-ish, functions are ok).

        More info: https://storybook.js.org/docs/react/essentials/controls#fully-custom-args
      `);
      return { name: 'other', value: 'cyclic object' };
    }
    visited.add(value);
    if (Array.isArray(value)) {
      const childType: SBType =
        value.length > 0
          ? inferType(value[0], name, new Set(visited))
          : { name: 'other', value: 'unknown' };
      return { name: 'array', value: childType };
    }
    const fieldTypes = mapValues(value, (field) => inferType(field, name, new Set(visited)));
    return { name: 'object', value: fieldTypes };
  }
  return { name: 'object', value: {} };
};

export const inferArgTypes: ArgTypesEnhancer = (context) => {
  const { id, parameters } = context;
  const { argTypes: userArgTypes = {}, args = {} } = parameters;
  if (!args) return userArgTypes;
  const argTypes = mapValues(args, (arg, key) => ({
    type: inferType(arg, `${id}.${key}`, new Set()),
  }));
  return combineParameters(argTypes, userArgTypes);
};
