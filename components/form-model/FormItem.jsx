import AsyncValidator from 'async-validator';
import cloneDeep from 'lodash/cloneDeep';
import PropTypes from '../_util/vue-types';
import { ColProps } from '../grid/Col';
import {
  initDefaultProps,
  getComponentFromProp,
  getOptionProps,
  getEvents,
  filterEmpty,
  isValidElement,
} from '../_util/props-util';
import BaseMixin from '../_util/BaseMixin';
import { ConfigConsumerProps } from '../config-provider';
import FormItem from '../form/FormItem';
import { cloneElement } from '../_util/vnode';

function noop() {}

function getPropByPath(obj, path, strict) {
  let tempObj = obj;
  path = path.replace(/\[(\w+)\]/g, '.$1');
  path = path.replace(/^\./, '');

  let keyArr = path.split('.');
  let i = 0;
  for (let len = keyArr.length; i < len - 1; ++i) {
    if (!tempObj && !strict) break;
    let key = keyArr[i];
    if (key in tempObj) {
      tempObj = tempObj[key];
    } else {
      if (strict) {
        throw new Error('please transfer a valid prop path to form item!');
      }
      break;
    }
  }
  return {
    o: tempObj,
    k: keyArr[i],
    v: tempObj ? tempObj[keyArr[i]] : null,
  };
}
export const FormItemProps = {
  id: PropTypes.string,
  htmlFor: PropTypes.string,
  prefixCls: PropTypes.string,
  label: PropTypes.any,
  help: PropTypes.any,
  extra: PropTypes.any,
  labelCol: PropTypes.shape(ColProps).loose,
  wrapperCol: PropTypes.shape(ColProps).loose,
  hasFeedback: PropTypes.bool,
  colon: PropTypes.bool,
  labelAlign: PropTypes.oneOf(['left', 'right']),
  prop: PropTypes.string,
  rules: PropTypes.oneOfType([Array, Object]),
  autoLink: PropTypes.bool,
  required: PropTypes.bool,
  validateStatus: PropTypes.oneOf(['', 'success', 'warning', 'error', 'validating']),
};

export default {
  name: 'AFormModelItem',
  __ANT_NEW_FORM_ITEM: true,
  mixins: [BaseMixin],
  props: initDefaultProps(FormItemProps, {
    hasFeedback: false,
    autoLink: true,
  }),
  provide() {
    return {
      FormModelItemContext: this,
    };
  },
  inject: {
    configProvider: { default: () => ConfigConsumerProps },
    FormModelContext: { default: () => ({}) },
  },
  data() {
    return {
      validateState: this.validateStatus,
      validateMessage: '',
      validateDisabled: false,
      validator: {},
    };
  },

  computed: {
    fieldValue() {
      const model = this.FormModelContext.model;
      if (!model || !this.prop) {
        return;
      }
      let path = this.prop;
      if (path.indexOf(':') !== -1) {
        path = path.replace(/:/g, '.');
      }
      return getPropByPath(model, path, true).v;
    },
    isRequired() {
      let rules = this.getRules();
      let isRequired = false;
      if (rules && rules.length) {
        rules.every(rule => {
          if (rule.required) {
            isRequired = true;
            return false;
          }
          return true;
        });
      }
      return isRequired;
    },
  },
  watch: {
    validateStatus(val) {
      this.validateState = val;
    },
  },
  mounted() {
    if (this.prop) {
      const { addField } = this.FormModelContext;
      addField && addField(this);
      this.initialValue = cloneDeep(this.fieldValue);
    }
  },
  beforeDestroy() {
    const { removeField } = this.FormModelContext;
    removeField && removeField(this);
  },
  methods: {
    validate(trigger, callback = noop) {
      this.validateDisabled = false;
      const rules = this.getFilteredRule(trigger);
      if (!rules || rules.length === 0) {
        callback();
        return true;
      }
      this.validateState = 'validating';
      const descriptor = {};
      if (rules && rules.length > 0) {
        rules.forEach(rule => {
          delete rule.trigger;
        });
      }
      descriptor[this.prop] = rules;
      const validator = new AsyncValidator(descriptor);
      const model = {};
      model[this.prop] = this.fieldValue;
      validator.validate(model, { firstFields: true }, (errors, invalidFields) => {
        this.validateState = errors ? 'error' : 'success';
        this.validateMessage = errors ? errors[0].message : '';
        callback(this.validateMessage, invalidFields);
        this.FormModelContext &&
          this.FormModelContext.$emit &&
          this.FormModelContext.$emit('validate', this.prop, !errors, this.validateMessage || null);
      });
    },
    getRules() {
      let formRules = this.FormModelContext.rules;
      const selfRules = this.rules;
      const requiredRule =
        this.required !== undefined ? { required: !!this.required, trigger: 'change' } : [];
      const prop = getPropByPath(formRules, this.prop || '');
      formRules = formRules ? prop.o[this.prop || ''] || prop.v : [];
      return [].concat(selfRules || formRules || []).concat(requiredRule);
    },
    getFilteredRule(trigger) {
      const rules = this.getRules();
      return rules
        .filter(rule => {
          if (!rule.trigger || trigger === '') return true;
          if (Array.isArray(rule.trigger)) {
            return rule.trigger.indexOf(trigger) > -1;
          } else {
            return rule.trigger === trigger;
          }
        })
        .map(rule => ({ ...rule }));
    },
    onFieldBlur() {
      this.validate('blur');
    },
    onFieldChange() {
      if (this.validateDisabled) {
        this.validateDisabled = false;
        return;
      }
      this.validate('change');
    },
    clearValidate() {
      this.validateState = '';
      this.validateMessage = '';
      this.validateDisabled = false;
    },
    resetField() {
      this.validateState = '';
      this.validateMessage = '';
      let model = this.FormModelContext.model || {};
      let value = this.fieldValue;
      let path = this.prop;
      if (path.indexOf(':') !== -1) {
        path = path.replace(/:/, '.');
      }
      let prop = getPropByPath(model, path, true);
      this.validateDisabled = true;
      if (Array.isArray(value)) {
        prop.o[prop.k] = [].concat(this.initialValue);
      } else {
        prop.o[prop.k] = this.initialValue;
      }
      // reset validateDisabled after onFieldChange triggered
      this.$nextTick(() => {
        this.validateDisabled = false;
      });
    },
  },
  render() {
    const { $slots, $scopedSlots } = this;
    const props = getOptionProps(this);
    const label = getComponentFromProp(this, 'label');
    const extra = getComponentFromProp(this, 'extra');
    const help = getComponentFromProp(this, 'help');
    const formProps = {
      props: {
        ...props,
        label,
        extra,
        validateStatus: this.validateState,
        help: this.validateMessage || help,
        required: this.isRequired || props.required,
      },
    };
    const children = filterEmpty($scopedSlots.default ? $scopedSlots.default() : $slots.default);
    let firstChildren = children[0];
    if (this.prop && this.autoLink && isValidElement(firstChildren)) {
      const originalEvents = getEvents(firstChildren);
      firstChildren = cloneElement(firstChildren, {
        on: {
          blur: (...args) => {
            originalEvents.blur && originalEvents.blur(...args);
            this.onFieldBlur();
          },
          change: (...args) => {
            originalEvents.change && originalEvents.change(...args);
            this.onFieldChange();
          },
        },
      });
    }
    return (
      <FormItem {...formProps}>
        {firstChildren}
        {children.slice(1)}
      </FormItem>
    );
  },
};