import Image from 'next/image'
import logo from '@/public/logo.svg'

type LogoProps = {
  height?: number
  className?: string
}

export function Logo({ height = 36, className = '' }: LogoProps) {
  return (
    <Image
      src={logo}
      alt="CalibiAI logo"
      width={Math.round(height * logo.width / logo.height)}
      height={height}
      className={`shrink-0 object-contain ${className}`}
      priority
      unoptimized
    />
  )
}
