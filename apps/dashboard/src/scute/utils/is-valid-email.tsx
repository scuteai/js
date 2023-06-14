
export const emailRegx = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

export const isValidEmail = (email:string) => {
   // eslint-disable-next-line no-useless-escape
  if (!email) {
    return false
  } else if (!emailRegx.test(email)) {
    return false
  } else {
    return true;
  }
}
