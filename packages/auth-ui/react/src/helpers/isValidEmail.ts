const emailRegex = /^\S+@\S+\.\S+$/;

export const isValidEmail = (email: string) => {
  if (email && emailRegex.test(email)) {
    return true;
  } else {
    return false;
  }
};
