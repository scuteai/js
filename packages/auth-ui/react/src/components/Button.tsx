import { styled, shadowCreator } from '../stitches.config';

export  const ResetButton = styled('button', {
  all: 'unset',
  alignItems: 'center',
  boxSizing: 'border-box',
  userSelect: 'none',
  '&::before': {
    boxSizing: 'border-box',
  },
  '&::after': {
    boxSizing: 'border-box',
  },
})

//(state:string, border:string, ring1:string, ring2:string, bottom1:string, bottom2:string)
export const Button = styled('button', {
  // Reset
  all: 'unset',
  alignItems: 'center',
  boxSizing: 'border-box',
  userSelect: 'none',
  '&::before': {
    boxSizing: 'border-box',
  },
  '&::after': {
    boxSizing: 'border-box',
  },
  transition:'all .2s ease-in-out',
  // Custom reset?
  display: 'inline-flex',
  gap:'$1',
  flexShrink: 0,
  justifyContent: 'center',
  lineHeight: '1',
  WebkitTapHighlightColor: 'rgba(0,0,0,0)',
  cursor:'pointer',
  // Custom
  height: '$5',
  px: '$2',
  fontFamily: '$main',
  fontSize: '$1',
  fontWeight: '500',
  fontVariantNumeric: 'tabular-nums',
  borderRadius:'$2',
  position:'relative',
  '@bp1' : {
    fontSize:"$2",
  },


  backgroundColor:'$buttonIdleBg',
  color:'$buttonIdleText',
  boxShadow:shadowCreator('initial', '$colors$buttonIdleBorder', '$colors$buttonIdleRing1', '$colors$buttonIdleRing2', '$colors$buttonIdleShadow1', '$colors$buttonIdleShadow2'),

  '& svg': {
    position:'absolute',
    right:'10px', 
    width:'34px'
  },
  //border:string, ring1:string, ring2:string, bottom1:string, bottom2:string)
  '&:hover': {
    backgroundColor:'$buttonHoverBg',
    color:'$buttonHoverText',
    boxShadow:shadowCreator('initial', '$colors$buttonHoverBorder', '$colors$buttonHoverRing1', '$colors$buttonHoverRing2', '$colors$buttonHoverShadow1', '$colors$buttonHoverShadow2'),
  },
  '&:focus': {
    backgroundColor:'$buttonHoverBg',
    color:'$buttonHoverText',
    boxShadow:shadowCreator('focus', '$colors$buttonFocusBorder', '$colors$buttonFocusRing1', '$colors$buttonFocusRing2', '$colors$buttonFocusShadow1', '$colors$buttonFocusShadow2'),
  },
  '&:active': {
    backgroundColor:'$buttonHoverBg',
    color:'$buttonHoverText',
    transform:'scale(0.99)',
    boxShadow:shadowCreator('initial', '$colors$buttonFocusBorder', '$colors$buttonFocusRing1', '$colors$buttonFocusRing2', '$colors$buttonFocusShadow1', '$colors$buttonFocusShadow2'),
  },
  '&:disabled': {
    backgroundColor: '$contrast1',
    boxShadow: 'inset 0 0 0 1px $colors$contrast2',
    color: '$contrast3',
    pointerEvents: 'none',
    '& svg': {
      opacity:'0.3'
    }
  },

  variants: {
    size: {
      '1': {
        borderRadius: '$3',
        height: '$6',
        px: '$2',
        fontSize: '$1',
        lineHeight: '$sizes$5',
      },
      '2': {
        borderRadius: '$3',
        height: '$9',
        px: '$3',
        fontSize: '$2',
        lineHeight: '$sizes$6',
        width:'100%'
      }
    },

    //(state:string, border:string, ring1:string, ring2:string, bottom1:string, bottom2:string)


    // 

    variant: {
      alt: {
        backgroundColor:'$buttonAltIdleBg',
        color:'$buttonAltIdleText',
        boxShadow:shadowCreator('initial', '$colors$buttonAltIdleBorder', '$colors$buttonAltIdleRing1', '$colors$buttonAltIdleRing2', '$colors$buttonAltIdleShadow1', '$colors$buttonAltIdleShadow2'),
        '&:hover': {
          backgroundColor:'$buttonAltHoverBg',
          color:'$buttonAltHoverText',
          boxShadow:shadowCreator('initial', '$colors$buttonAltHoverBorder', '$colors$buttonAltHoverRing1', '$colors$buttonAltHoverRing2', '$colors$buttonAltHoverShadow1', '$colors$buttonAltHoverShadow2'),
        },
        '&:focus': {
          backgroundColor:'$buttonAltHoverBg',
          color:'$buttonAltHoverText',
          boxShadow:shadowCreator('focus', '$colors$buttonAltFocusBorder', '$colors$buttonAltFocusRing1', '$colors$buttonAltFocusRing2', '$colors$buttonAltFocusShadow1', '$colors$buttonAltFocusShadow2'),
        },
        '&:active': {
          backgroundColor:'$buttonAltHoverBg',
          color:'$buttonAltHoverText',
          boxShadow:shadowCreator('initial', '$colors$buttonAltFocusBorder', '$colors$buttonAltFocusRing1', '$colors$buttonAltFocusRing2', '$colors$buttonAltFocusShadow1', '$colors$buttonAltFocusShadow2'),
        },
      },
    }
   
  },
  defaultVariants: {
    size:1
  }
});

