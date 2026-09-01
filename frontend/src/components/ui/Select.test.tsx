import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Select } from './Select'

function ControlledSelect() {
  const [value, setValue] = useState('en')
  return (
    <Select
      aria-label="Translation language"
      value={value}
      onValueChange={setValue}
      options={[
        { value: 'en', label: 'English' },
        { value: 'fr', label: 'French' },
      ]}
    />
  )
}

describe('Select', () => {
  it('shows the selected option and switches on choosing another', async () => {
    render(<ControlledSelect />)
    expect(screen.getByRole('combobox')).toHaveTextContent('English')
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(await screen.findByRole('option', { name: 'French' }))
    expect(screen.getByRole('combobox')).toHaveTextContent('French')
  })
})
