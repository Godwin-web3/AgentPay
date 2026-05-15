import { useState, useEffect } from 'react'
import WalletConnect from '../components/WalletConnect'

interface Props {
  userAddress: string
  onComplete: () => void
}

export default function Onboarding({ userAddress, onComplete }: Props) {
  const [step, setStep] = useState(1)

  useEffect(() => {
    if (userAddress && step === 1) {
      setStep(2)
    }
  }, [userAddress, step])

  const steps = [
    { id: 1, title: 'Identity', desc: 'Connect your wallet to establish your autonomous agent identity on Somnia.' },
    { id: 2, title: 'Assets', desc: 'Deposit STT into your secure Vault. This is what your Agent will use for transactions.' },
    { id: 3, title: 'Safety', desc: 'Configure your spending rules. Your Agent will never exceed these limits, guaranteed by code.' }
  ]

  const handleNext = () => {
    if (step < 3) setStep(step + 1)
    else {
      localStorage.setItem('agentpay_onboarded', 'true')
      onComplete()
    }
  }

  const skipAll = () => {
    localStorage.setItem('agentpay_onboarded', 'true')
    onComplete()
  }

  return (
    <div className="onboarding-container">
      <div className="progress-stepper">
        {steps.map((s) => (
          <div 
            key={s.id} 
            className={`step-dot ${step === s.id ? 'active' : ''} ${step > s.id ? 'completed' : ''}`}
          >
            {step > s.id ? '✓' : s.id}
          </div>
        ))}
      </div>

      <div className="onboarding-card">
        <div style={{ fontSize: 40, marginBottom: 20 }}>
          {step === 1 && '🔑'}
          {step === 2 && '💰'}
          {step === 3 && '🛡️'}
        </div>
        
        <h2>{steps[step - 1].title}</h2>
        <p>{steps[step - 1].desc}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          {step === 1 && (
            <div style={{ transform: 'scale(1.2)', margin: '10px 0' }}>
              <WalletConnect onAddressChange={() => {}} />
            </div>
          )}

          {step === 2 && (
            <button className="send-btn" onClick={handleNext} style={{ width: '100%' }}>
              I've Deposited / Continue
            </button>
          )}

          {step === 3 && (
            <button className="send-btn" onClick={handleNext} style={{ width: '100%' }}>
              Finish Setup
            </button>
          )}

          <button className="skip-link" onClick={step === 3 ? handleNext : () => setStep(step + 1)}>
            {step === 3 ? 'Done' : 'Skip this step'}
          </button>
        </div>
      </div>

      <button className="skip-link" onClick={skipAll} style={{ margin: '30px auto', display: 'block', textAlign: 'center' }}>
        Skip Onboarding
      </button>
    </div>
  )
}
