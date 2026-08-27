/* eslint-disable */
/* tslint:disable */
import {
  TypeBuilder as __TypeBuilder,
  t as __t,
} from "spacetimedb";

// Input arguments for verify_phone_code procedure
const verify_phone_code_args = {
  phone_number: __t.string(),
  code: __t.string(),
};

// Return type for verify_phone_code procedure
const verify_phone_code_result = __t.object('VerifyPhoneResult', {
  success: __t.bool(),
  error: __t.option(__t.string()),
});

export default {
  args: verify_phone_code_args,
  result: verify_phone_code_result,
};
