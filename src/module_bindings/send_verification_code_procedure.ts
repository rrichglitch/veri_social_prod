/* eslint-disable */
/* tslint:disable */
import {
  TypeBuilder as __TypeBuilder,
  t as __t,
} from "spacetimedb";

// Input arguments for send_verification_code procedure
const send_verification_code_args = {
  email: __t.string(),
  full_name: __t.string(),
  profile_picture: __t.string(),
  city: __t.string(),
  description: __t.string(),
  phone_number: __t.string(),
};

// Return type for send_verification_code procedure
const send_verification_code_result = __t.object('SendVerificationResult', {
  success: __t.bool(),
  error: __t.option(__t.string()),
});

export default {
  args: send_verification_code_args,
  result: send_verification_code_result,
};
