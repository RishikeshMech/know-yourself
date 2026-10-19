import Image from 'next/image'
import logo from '@/public/logo.png'

type LogoProps = {
  height?: number
  className?: string
}

export function Logo({ height = 36, className = '' }: LogoProps) {
  return (
    <Image
      src={logo}
      alt="Calibi Score logo"
      width={height}
      height={height}
      className={`shrink-0 object-contain ${className}`}
      priority
      unoptimized
    />
  )
}
