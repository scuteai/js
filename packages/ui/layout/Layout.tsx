import { styled } from '../stitches.config';

const sidebarW = '260px'
const navbarH = '55px'

export const LayoutWrapper = styled('div', {
  display:'flex',
  width:`calc(100%)`,
  height:'100%',
  fd:'column',
  transition:'all .3s ease',
  position:'relative'
})

export const Navbar = styled('div',{
  height:navbarH,
  flexShrink:'0',
  px:'$3',
  borderBottom:'1px solid $colors$gray3',
  display:'flex',
  jc:'space-between',
  ai:'center',
  width:'100%',
  zIndex:'1',
  position:'sticky',
  top:'0px',
  bc:'$loContrast'
})

export const NavbarHeader = styled('div', {
  display:'flex',
  ai:'center',
  gap:'$3'

})
export const NavbarActions = styled('div', {
  display:'flex',
  fg:'1',
  justifyContent:'flex-end',
  gap:'$4'
})

export const LogoHolder = styled('div', {
  svg: {
    width:'100%',
    height:'auto'
  }
})

export const Wrapper = styled('div', {
  flexGrow:'1',
  display:'flex',
  fd:'row',
})

export const Sidebar = styled('aside', {
  width:sidebarW,
  flexShrink:'0',
  display:'flex',
  fd:'column',
  alignSelf:'flex-start',
  transition:'all .3s ease-in',
  background:'white',
  borderRight:'1px solid $gray2',
  position:'sticky',
  top:navbarH,
  height:`calc(100vh - ${navbarH})`
})


export const Content = styled('div', {
  flexGrow:'1',
  bc:'$gray1',
  p:'$5'
})



export const CenterContent = styled('div', {
  bc:'$gray1',
  height:'100vh',
  p:'$5',
  display:'flex',
  ai:'center',
  jc:'center'
})


