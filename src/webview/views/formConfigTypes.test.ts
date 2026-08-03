import { describe, it, expect } from 'vitest';
import {
  getFormData,
  hasFormConfig,
  FORM_DATA_KEY,
  FORM_CONFIG_KEY,
  FORM_META_KEY,
} from './formConfigTypes';

describe('formConfigTypes', () => {
  describe('getFormData', () => {
    it('extracts values from formData key when present', () => {
      const data = {
        formConfig: [{ keyName: 'name', component: 'Input' }],
        formData: { name: 'Alice', age: 18 },
      };
      expect(getFormData(data)).toEqual({ name: 'Alice', age: 18 });
    });

    it('does not fall back to root-level fields when formData is missing', () => {
      const data = {
        __form: { submit: { url: '/x' } },
        formConfig: [{ keyName: 'name', component: 'Input' }],
        name: 'Alice',
        age: 18,
      };
      expect(getFormData(data)).toEqual({});
    });

    it('returns empty object for null/array/primitive', () => {
      expect(getFormData(null)).toEqual({});
      expect(getFormData([])).toEqual({});
      expect(getFormData(42)).toEqual({});
      expect(getFormData('str')).toEqual({});
    });

    it('does not treat an ordinary object as modern formData', () => {
      const data = { name: 'Bob', active: true };
      expect(getFormData(data)).toEqual({});
    });

    it('formData takes priority over root-level values', () => {
      const data = {
        formConfig: [],
        formData: { name: 'FormDataName' },
      };
      expect(getFormData(data)).toEqual({ name: 'FormDataName' });
    });
  });

  describe('hasFormConfig', () => {
    it('returns true only for the modern formConfig + formData root', () => {
      expect(hasFormConfig({ formConfig: [], formData: {} })).toBe(true);
      expect(hasFormConfig({
        formConfig: [{ label: 'X', keyName: 'x', component: 'Input' }],
        formData: { x: '' },
        __form: { submit: [] },
      })).toBe(true);
      expect(hasFormConfig({ formConfig: [] })).toBe(false);
      expect(hasFormConfig({ formConfig: [], formData: {}, legacy: true })).toBe(false);
    });

    it('returns false when formConfig is missing or not an array', () => {
      expect(hasFormConfig({})).toBe(false);
      expect(hasFormConfig({ formConfig: 'not-array' })).toBe(false);
      expect(hasFormConfig(null)).toBe(false);
      expect(hasFormConfig([])).toBe(false);
    });
  });

  describe('key constants', () => {
    it('exports correct key names', () => {
      expect(FORM_DATA_KEY).toBe('formData');
      expect(FORM_CONFIG_KEY).toBe('formConfig');
      expect(FORM_META_KEY).toBe('__form');
    });
  });
});
