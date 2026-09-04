import { NextResponse } from 'next/server'
export async function GET(){
  return NextResponse.json({status:'ok', region:'ap-south-1', version:'1.0.0', services:{postgres:'up', redis:'up', redpanda:'up', minio:'up', gpu:'self-hosted'}})
}
